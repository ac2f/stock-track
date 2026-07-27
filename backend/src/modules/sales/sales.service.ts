import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { LedgerSourceType } from '../../common/enums/ledger-source-type.enum';
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../common/enums/sale-source.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../common/dto/paginated-result';
import { roundMoney, totalAreaM2 } from '../../common/utils/area.util';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import {
  businessMarginOf,
  ownerShareCommission,
  ownerShareManual,
} from './sale-calc.util';
import { PlatesService } from '../materials/services/plates.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CurrencyService } from '../currency/currency.service';
import { CustomersService } from '../customers/services/customers.service';
import { CustomerAccountService } from '../customers/services/customer-account.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { CreateSaleDto, SaleItemDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';

export interface SaleResult {
  sale: Sale;
  buyerBalance: number;
  ownerBalance?: number;
}

export interface SaleCreatedEvent {
  saleId: string;
  buyerCustomerId: string;
  ownerCustomerId?: string;
  baseSaleTotal: number;
  baseOwnerAmount: number;
  businessMargin: number;
}

@Injectable()
export class SalesService {
  private readonly defaultCurrency: string;
  private readonly defaultWarehouseCode: string;

  constructor(
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    private readonly platesService: PlatesService,
    private readonly warehousesService: WarehousesService,
    private readonly currencyService: CurrencyService,
    private readonly customersService: CustomersService,
    private readonly accountService: CustomerAccountService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.defaultCurrency =
      configService.get<string>('business.defaultCurrency') ?? 'TRY';
    this.defaultWarehouseCode =
      configService.get<string>('business.defaultWarehouseCode') ?? 'MERKEZ';
  }

  /**
   * Satış oluşturur. TEK transaction içinde:
   *  1) kalemleri ve sahip paylarını hesaplar (manuel tutar / komisyon %),
   *  2) stok kaynağına göre stok düşer (kendi / konsinye-takipli / takipsiz),
   *  3) alıcıyı borçlandırır (DEBIT), üçüncü kişi sahibini alacaklandırır (CREDIT),
   *  4) baz para birimine çevirip cariye işler. İşletme kârı = satış − sahip payı.
   */
  async create(dto: CreateSaleDto, soldById: string): Promise<SaleResult> {
    const { result, event } = await this.dataSource.transaction((manager) =>
      this.persist(manager, dto, soldById),
    );
    this.eventEmitter.emit('sale.created', event);
    return result;
  }

  /**
   * Satışın çekirdek mantığı — verilen EntityManager içinde çalışır (teklif
   * dönüşümü gibi dış bir transaction'dan da çağrılabilir). `sale.created` olayı
   * BURADA yayınlanmaz; commit sonrası yayınlanmak üzere `event` döndürülür.
   */
  async persist(
    manager: EntityManager,
    dto: CreateSaleDto,
    soldById: string,
    opts: { allowNegativeStock?: boolean } = {},
  ): Promise<{ result: SaleResult; event: SaleCreatedEvent }> {
    await this.customersService.findOne(dto.buyerCustomerId);

    const currency = (dto.currency ?? this.defaultCurrency).toUpperCase();
    const saleDate = dto.saleDate ? new Date(dto.saleDate) : new Date();

    // Kalemlerin plakalarını yükle (m² bazlı fiyatlama ölçüm tipine göre yapılır).
    // Serbest (plakasız) kalemler atlanır.
    const plateById = new Map<string, MaterialPlate>();
    for (const it of dto.items) {
      if (it.plateId && !plateById.has(it.plateId)) {
        plateById.set(it.plateId, await this.platesService.findOne(it.plateId));
      }
    }

    // Kalemlerin sahipliğini stok gerçeğine göre düzelt: müşteriye ait her
    // malzeme konsinye sayılır (bkz. resolveOwnership). Bundan sonraki tüm
    // hesaplar/stok hareketleri `saleItems` üzerinden yürür.
    const { items: saleItems, ownerCustomerId } = await this.resolveOwnership(
      dto,
      plateById,
      manager,
    );

    // Serbest (stoksuz, plakasız) kalemin stockSource'u yoktur → sahip gerektirmez.
    const needsOwner = saleItems.some(
      (i) =>
        !!i.plateId &&
        i.stockSource != null &&
        i.stockSource !== SaleStockSource.BUSINESS,
    );
    if (needsOwner && !ownerCustomerId) {
      throw new BadRequestException(
        'Üçüncü kişi malzemesi satışında malzeme sahibi (ownerCustomerId) zorunludur.',
      );
    }
    if (ownerCustomerId) {
      await this.customersService.findOne(ownerCustomerId);
    }

    // Kalem hesapları (işlem para biriminde).
    const computedItems = saleItems.map((item) =>
      this.computeItem(
        item,
        !!ownerCustomerId,
        item.plateId ? plateById.get(item.plateId) : undefined,
      ),
    );
    const saleTotal = roundMoney(
      computedItems.reduce((s, i) => s + i.lineTotal, 0),
    );
    const ownerAmount = roundMoney(
      computedItems.reduce((s, i) => s + i.ownerAmount, 0),
    );
    const businessMargin = businessMarginOf(saleTotal, ownerAmount);

    // Baz para çevrimleri.
    const base = this.currencyService.baseCurrency;
    const saleConv = await this.currencyService.convert(
      saleTotal,
      currency,
      base,
      saleDate,
    );
    const baseSaleTotal = saleConv.amount;
    const exchangeRate = saleConv.rate;
    const baseOwnerAmount =
      ownerAmount > 0
        ? (await this.currencyService.convert(ownerAmount, currency, base, saleDate)).amount
        : 0;

    const needsWarehouse = saleItems.some(
      (i) =>
        i.stockSource === SaleStockSource.BUSINESS ||
        i.stockSource === SaleStockSource.CONSIGNMENT_TRACKED,
    );

    const warehouse = needsWarehouse
      ? dto.warehouseId
        ? await this.warehousesService.findOne(dto.warehouseId)
        : await this.warehousesService.resolveDefault(
            this.defaultWarehouseCode,
            manager,
          )
      : null;

    // Stok hareketleri (kaynağa göre) — kalemler oluşturulmadan ÖNCE yapılır ki
    // fiilen düşülen miktar (eksen/adet) kaleme yazılıp tek kayıtla saklanabilsin
    // (satış geri alınınca stok tam iade edilir). Tabaka (AREA) malzemede satılan
    // parçanın boyu kadar kalan ebat düşülür; diğerlerinde adet.
    const consumed = saleItems.map(() => ({
      widthMm: null as number | null,
      heightMm: null as number | null,
      quantity: 0,
    }));
    for (let idx = 0; idx < saleItems.length; idx++) {
      const item = saleItems[idx];
      if (!item.plateId) {
        continue; // serbest (stoksuz) kalem → stok hareketi yok
      }
      if (item.stockSource === SaleStockSource.THIRD_PARTY_UNTRACKED) {
        continue; // stok takip edilmiyor
      }
      const owner =
        item.stockSource === SaleStockSource.CONSIGNMENT_TRACKED
          ? ownerCustomerId ?? null
          : null;
      const cut = await this.platesService.consume({
        plateId: item.plateId,
        warehouseId: warehouse!.id,
        quantity: item.quantity,
        // Satılan ebada göre giyotin kesim (en/boy) — enlemesine dahil.
        consumedWidthMm: item.widthMm ?? null,
        consumedHeightMm: item.heightMm ?? null,
        ownerCustomerId: owner,
        manager,
        allowNegative: opts.allowNegativeStock ?? false,
      });
      consumed[idx] = {
        widthMm: cut.widthReducedMm || null,
        heightMm: cut.heightReducedMm || null,
        quantity: cut.widthReducedMm || cut.heightReducedMm ? 0 : item.quantity,
      };
    }

    const items: SaleItem[] = saleItems.map((item, idx) => {
      const plate = item.plateId ? plateById.get(item.plateId) : undefined;
      const adhoc = !item.plateId;
      return manager.create(SaleItem, {
        plateId: item.plateId ?? null,
        // Serbest kalemde ad + fiyatlama birimi saklanır (fiş/ekstre için).
        itemName: adhoc ? item.itemName?.trim() || 'Malzeme' : null,
        billingUnit: adhoc
          ? item.billingUnit ?? MeasurementType.PIECE
          : null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        // Tabaka satışında satılan ebadı kalemde sakla (fiş/raporda m² göstermek için).
        widthMm: item.widthMm ?? plate?.widthMm ?? null,
        heightMm: item.heightMm ?? plate?.heightMm ?? null,
        lineTotal: computedItems[idx].lineTotal,
        // Serbest kalemin stok kaynağı yoktur; plaka kaleminde verilmezse kendi stok.
        stockSource: adhoc ? null : item.stockSource ?? SaleStockSource.BUSINESS,
        ownerSettlement: item.ownerSettlement ?? null,
        commissionPercent: item.commissionPercent ?? null,
        ownerAmount: computedItems[idx].ownerAmount,
        // Stok iadesi için fiilen düşülen miktar (yukarıda hesaplandı).
        consumedWidthMm: consumed[idx].widthMm,
        consumedHeightMm: consumed[idx].heightMm,
        consumedQuantity: consumed[idx].quantity,
      });
    });

    const sale = manager.create(Sale, {
      buyerCustomerId: dto.buyerCustomerId,
      ownerCustomerId,
      soldById,
      warehouseId: warehouse?.id,
      saleDate,
      currency,
      exchangeRate,
      saleTotal,
      ownerAmount,
      businessMargin,
      baseSaleTotal,
      baseOwnerAmount,
      note: dto.note,
      items,
    });
    const savedSale = await manager.save(sale);

    // Alıcı borçlanır (DEBIT, baz tutarda). Açıklamaya kalem özetini (ürün,
    // miktar/m², birim fiyat) ekle ki cari ekstrede satış detayı görünsün (#4).
    const buyerBalance = await this.accountService.applyDebit(manager, {
      customerId: dto.buyerCustomerId,
      amount: baseSaleTotal,
      sourceType: LedgerSourceType.SALE,
      sourceId: savedSale.id,
      description: this.saleDescription(saleItems, plateById, currency, dto.note),
      occurredAt: saleDate,
    });

    // Üçüncü kişi sahibi alacaklanır (CREDIT, baz tutarda) — TÜM konsinye
    // kalemlerin payı toplanarak tek harekette.
    let ownerBalance: number | undefined;
    if (ownerCustomerId && baseOwnerAmount > 0) {
      ownerBalance = await this.accountService.applyCredit(manager, {
        customerId: ownerCustomerId,
        amount: baseOwnerAmount,
        sourceType: LedgerSourceType.SALE,
        sourceId: savedSale.id,
        description: `Malzeme satış payı (Satış #${savedSale.id.slice(0, 8)})`,
        occurredAt: saleDate,
      });
    }

    return {
      result: { sale: savedSale, buyerBalance, ownerBalance },
      event: {
        saleId: savedSale.id,
        buyerCustomerId: dto.buyerCustomerId,
        ownerCustomerId,
        baseSaleTotal,
        baseOwnerAmount,
        businessMargin: roundMoney(baseSaleTotal - baseOwnerAmount),
      },
    };
  }

  /**
   * Kalemlerin sahipliğini STOK GERÇEĞİNE göre belirler.
   *
   * Arayüz, bir kalemi yalnızca kullanıcı "müşteri malzemesi" kaynağını elle
   * seçtiğinde konsinye olarak işaretliyordu; aynı müşterinin diğer malzemeleri
   * karışık listeden seçildiğinde kalem "işletme stoğu" olarak gidiyor ve
   * sahibinin carisine YANSIMIYORDU. Sonuç: birden çok malzemesi satılan
   * müşterinin bakiyesinden yalnızca tek kalemin tutarı düşüyordu.
   *
   * Burada her plakalı kalem için stok seviyelerindeki gerçek sahip bulunur;
   * malzeme bir müşteriye aitse (ve işletmenin o kalemde stoğu yoksa) kalem
   * konsinye kabul edilir. Böylece satılan HER malzeme sahibinin hesabına
   * geçer. Yöntem verilmemişse komisyon %0 uygulanır → satış tutarının tamamı
   * sahibin borcundan düşer.
   *
   * Dönen `ownerCustomerId`, kalemlerden tespit edilen (ya da istekte gelen)
   * tek sahiptir; satış modeli tek sahip taşıdığından farklı müşterilere ait
   * malzemeler aynı satışta birleştirilemez.
   */
  private async resolveOwnership(
    dto: CreateSaleDto,
    plateById: Map<string, MaterialPlate>,
    manager: EntityManager,
  ): Promise<{ items: SaleItemDto[]; ownerCustomerId?: string }> {
    const ownersByPlate = await this.platesService.consignmentOwners(
      [...plateById.keys()],
      manager,
    );

    // Kalemin (varsa) tek konsinye sahibi: işletmenin de stoğu varsa ya da
    // birden çok müşteriye aitse belirsizdir → elle işaretlemeye bırakılır.
    const ownerOf = (plateId: string): string | undefined => {
      if (Number(plateById.get(plateId)?.quantityInStock ?? 0) > 0) {
        return undefined;
      }
      const owners = ownersByPlate.get(plateId) ?? [];
      return owners.length === 1 ? owners[0] : undefined;
    };

    const detected = new Set<string>();
    const items = dto.items.map((item) => {
      if (!item.plateId) return item;
      const owner = ownerOf(item.plateId);
      const marked =
        item.stockSource != null &&
        item.stockSource !== SaleStockSource.BUSINESS;
      if (marked) {
        // Elle işaretlenmiş kalem: sahibi istekten (dto) gelir.
        return item;
      }
      if (!owner) return item;
      detected.add(owner);
      return {
        ...item,
        stockSource: SaleStockSource.CONSIGNMENT_TRACKED,
        ownerSettlement:
          item.ownerSettlement ?? OwnerSettlementType.COMMISSION_PERCENT,
        commissionPercent: item.commissionPercent ?? 0,
      };
    });

    if (detected.size > 1) {
      throw new BadRequestException(
        'Bir satışta yalnızca tek malzeme sahibi olabilir; farklı müşterilere ait malzemeleri ayrı satışlarda kaydedin.',
      );
    }
    const [detectedOwner] = detected;
    if (
      detectedOwner &&
      dto.ownerCustomerId &&
      detectedOwner !== dto.ownerCustomerId
    ) {
      throw new BadRequestException(
        'Satıştaki malzemeler farklı müşterilere ait; her sahibin malzemesini ayrı satışta kaydedin.',
      );
    }

    return { items, ownerCustomerId: dto.ownerCustomerId ?? detectedOwner };
  }

  /**
   * #2 Bir satışı geri alır (teklif silinirken çağrılır):
   *  - STOK İADE EDİLİR: her kalem, tüketildiği biçimde (tabaka ekseni / adet-metre)
   *    ve tüketildiği sahibe (işletme / konsinye müşterisi) stoğa geri eklenir.
   *    Takipsiz üçüncü kişi malzemesi ve serbest (stoksuz) kalemlerde stok hareketi
   *    yoktur → iadede de atlanır.
   *  - alıcı borcu (DEBIT) ve sahip payı (CREDIT) defter hareketlerini kaldırır,
   *  - satışı fiziksel siler (kalemler CASCADE).
   * Bakiyeyi YENİDEN HESAPLAMAZ — etkilenen müşteri id'lerini döner; çağıran toplu
   * halde recomputeBalances çağırmalıdır.
   */
  async reverseSale(manager: EntityManager, saleId: string): Promise<string[]> {
    const sale = await manager.findOne(Sale, {
      where: { id: saleId },
      withDeleted: true,
    });
    if (!sale) return [];

    // Stoğu iade et (satışı silmeden önce — kalemler hâlâ elimizde).
    for (const it of sale.items ?? []) {
      if (!it.plateId) continue; // serbest (stoksuz) kalem
      if (it.stockSource === SaleStockSource.THIRD_PARTY_UNTRACKED) continue;
      const owner =
        it.stockSource === SaleStockSource.CONSIGNMENT_TRACKED
          ? sale.ownerCustomerId ?? null
          : null;
      const cw = Number(it.consumedWidthMm) || 0;
      const ch = Number(it.consumedHeightMm) || 0;
      const plate = await manager.findOne(MaterialPlate, {
        where: { id: it.plateId },
        withDeleted: true,
      });
      if (plate?.measurementType === MeasurementType.AREA) {
        // Tabaka: izlenen düşülen ekseni geri ekle. Eski (izlenmemiş) satışlarda
        // en iyi tahminle satılan boyu geri ekle (tam-en yatay şerit varsayımı).
        if (cw > 0 || ch > 0) {
          await this.platesService.restoreSheet(it.plateId, cw, ch, manager);
        } else {
          await this.platesService.restoreSheet(
            it.plateId,
            0,
            Number(it.heightMm) || 0,
            manager,
          );
        }
      } else if (sale.warehouseId) {
        // Adet/metre: fiilen düşülen miktarı sahibine geri ekle (şerit sınırsız
        // olduğundan negatif bakiye de düzeltilir → allowNegative).
        const refund = Number(it.consumedQuantity) || Number(it.quantity);
        if (refund > 0) {
          await this.platesService.adjustStock(
            it.plateId,
            sale.warehouseId,
            refund,
            owner,
            manager,
            true,
          );
        }
      }
    }

    await this.accountService.removeBySource(
      manager,
      LedgerSourceType.SALE,
      sale.id,
    );
    const affected = new Set<string>();
    if (sale.buyerCustomerId) affected.add(sale.buyerCustomerId);
    if (sale.ownerCustomerId) affected.add(sale.ownerCustomerId);

    await manager.delete(Sale, { id: sale.id });
    return Array.from(affected);
  }

  async findAll(query: QuerySaleDto): Promise<PaginatedResult<Sale>> {
    const where: FindOptionsWhere<Sale> = {};
    if (query.buyerCustomerId) where.buyerCustomerId = query.buyerCustomerId;
    if (query.ownerCustomerId) where.ownerCustomerId = query.ownerCustomerId;
    if (query.from && query.to) {
      // `to` gün sonunu kapsasın — aksi halde BUGÜN yapılan satışlar (saat >
      // 00:00) aralık dışında kalıp geçmiş listesinde görünmüyordu.
      const toEnd = new Date(query.to);
      toEnd.setHours(23, 59, 59, 999);
      where.saleDate = Between(new Date(query.from), toEnd);
    }
    const [items, total] = await this.salesRepo.findAndCount({
      where,
      order: { saleDate: 'DESC' },
      skip: query.skip,
      take: query.limit,
      withDeleted: true, // tükenmiş plakaların adı satış listesinde görünsün
    });
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Sale> {
    const sale = await this.salesRepo.findOne({
      where: { id },
      withDeleted: true, // tükenmiş plakaların adı fatura/fişte görünsün
    });
    if (!sale) {
      throw new NotFoundException('Satış kaydı bulunamadı.');
    }
    return sale;
  }

  /**
   * Bir kalemin satır toplamını ve (varsa) sahip payını hesaplar. Tabaka (AREA)
   * malzemede birim fiyat m² başına uygulanır: satır = (en×boy×adet m²) × birim fiyat.
   * Böylece 1.000 TL/m²'den 1,5 m² satışta satır 1.500 TL olur (1.000 değil).
   */
  private computeItem(
    item: SaleItemDto,
    hasOwner: boolean,
    plate?: MaterialPlate,
  ): { lineTotal: number; ownerAmount: number } {
    const lineTotal = this.lineTotalFor(item, plate);

    // Serbest (stoksuz) kalem: sahip payı yok, tümü işletme geliri.
    if (!item.plateId) {
      return { lineTotal, ownerAmount: 0 };
    }

    if (
      item.stockSource == null ||
      item.stockSource === SaleStockSource.BUSINESS
    ) {
      return { lineTotal, ownerAmount: 0 };
    }

    if (!hasOwner) {
      throw new BadRequestException(
        'Üçüncü kişi malzemesi kaleminde malzeme sahibi belirtilmelidir.',
      );
    }
    if (!item.ownerSettlement) {
      throw new BadRequestException(
        'Üçüncü kişi malzemesi kaleminde sahip payı yöntemi (ownerSettlement) zorunludur.',
      );
    }

    if (item.ownerSettlement === OwnerSettlementType.MANUAL_AMOUNT) {
      if (item.ownerAmount == null) {
        throw new BadRequestException(
          'manual_amount yönteminde sahibe verilecek tutar (ownerAmount) zorunludur.',
        );
      }
      return { lineTotal, ownerAmount: ownerShareManual(item.ownerAmount) };
    }

    // COMMISSION_PERCENT: işletme komisyonu düşülür, kalanı sahibe.
    if (item.commissionPercent == null) {
      throw new BadRequestException(
        'commission_percent yönteminde komisyon yüzdesi (commissionPercent) zorunludur.',
      );
    }
    return {
      lineTotal,
      ownerAmount: ownerShareCommission(lineTotal, item.commissionPercent),
    };
  }

  /**
   * Cari ekstre için satış açıklaması: her kalemde ürün adı, miktar (m²/adet) ve
   * birim fiyat. Örn. "Satış: Pleksi 1,5 m² × 1.000 TRY/m²".
   */
  private saleDescription(
    items: SaleItemDto[],
    plateById: Map<string, MaterialPlate>,
    currency: string,
    note?: string,
  ): string {
    const fmt = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const parts = items.map((item) => {
      const plate = item.plateId ? plateById.get(item.plateId) : undefined;
      const baseName = plate?.name ?? (item.itemName?.trim() || 'Malzeme');
      // Malzeme TÜRÜ (Pleksi/Kompozit…) ekstrede görünsün.
      const type = plate?.template?.category?.name;
      const name = type ? `${type} ${baseName}` : baseName;
      const unit =
        plate?.measurementType ?? item.billingUnit ?? MeasurementType.PIECE;
      const widthMm = item.widthMm ?? plate?.widthMm ?? null;
      const heightMm = item.heightMm ?? plate?.heightMm ?? null;
      // Kalem notu (varsa) açıklamaya eklenir → cari ekstrede görünür.
      const note = item.description?.trim() ? ` — ${item.description.trim()}` : '';
      if (unit === MeasurementType.AREA && widthMm && heightMm) {
        const m2 = totalAreaM2(Number(widthMm), Number(heightMm), item.quantity);
        return `${name} ${fmt.format(m2)} m² × ${fmt.format(item.unitPrice)} ${currency}/m²${note}`;
      }
      // Şerit/rulo (LENGTH) satışında miktar metredir — "adet" değil.
      if (unit === MeasurementType.LENGTH) {
        return `${name} ${fmt.format(item.quantity)} m × ${fmt.format(item.unitPrice)} ${currency}/m${note}`;
      }
      return `${name} ${fmt.format(item.quantity)} adet × ${fmt.format(item.unitPrice)} ${currency}${note}`;
    });
    const head = note?.trim() ? `Satış (${note.trim()}): ` : 'Satış: ';
    return `${head}${parts.join('; ')}`;
  }

  /**
   * Satır toplamı: tabaka (AREA) malzemede birim fiyat m² başına uygulanır;
   * diğerlerinde (adet/metre/kg) doğrudan adet ile çarpılır. Satılan ebat kalemde
   * verilmemişse plakanın (kalan) ebadı kullanılır. m² için ebat yoksa adet bazına
   * güvenli geri dönüş yapılır.
   */
  private lineTotalFor(item: SaleItemDto, plate?: MaterialPlate): number {
    // Plaka varsa ölçüm tipi ondan; serbest kalemde kalemin billingUnit'inden.
    const unit =
      plate?.measurementType ?? item.billingUnit ?? MeasurementType.PIECE;
    const widthMm = item.widthMm ?? plate?.widthMm ?? null;
    const heightMm = item.heightMm ?? plate?.heightMm ?? null;
    if (unit === MeasurementType.AREA && widthMm && heightMm) {
      const m2 = totalAreaM2(Number(widthMm), Number(heightMm), item.quantity);
      return roundMoney(m2 * item.unitPrice);
    }
    return roundMoney(item.quantity * item.unitPrice);
  }
}
