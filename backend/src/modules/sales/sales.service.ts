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
import { roundMoney } from '../../common/utils/area.util';
import {
  businessMarginOf,
  lineTotalOf,
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
    const needsOwner = dto.items.some(
      (i) => i.stockSource !== SaleStockSource.BUSINESS,
    );
    if (needsOwner && !dto.ownerCustomerId) {
      throw new BadRequestException(
        'Üçüncü kişi malzemesi satışında malzeme sahibi (ownerCustomerId) zorunludur.',
      );
    }
    if (dto.ownerCustomerId) {
      await this.customersService.findOne(dto.ownerCustomerId);
    }

    const currency = (dto.currency ?? this.defaultCurrency).toUpperCase();
    const saleDate = dto.saleDate ? new Date(dto.saleDate) : new Date();

    // Kalem hesapları (işlem para biriminde).
    const computedItems = dto.items.map((item) =>
      this.computeItem(item, !!dto.ownerCustomerId),
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

    const needsWarehouse = dto.items.some(
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

    const items: SaleItem[] = dto.items.map((item, idx) =>
      manager.create(SaleItem, {
        plateId: item.plateId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: computedItems[idx].lineTotal,
        stockSource: item.stockSource,
        ownerSettlement: item.ownerSettlement ?? null,
        commissionPercent: item.commissionPercent ?? null,
        ownerAmount: computedItems[idx].ownerAmount,
      }),
    );

    const sale = manager.create(Sale, {
      buyerCustomerId: dto.buyerCustomerId,
      ownerCustomerId: dto.ownerCustomerId,
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

    // Stok hareketleri (kaynağa göre).
    for (const item of dto.items) {
      if (item.stockSource === SaleStockSource.THIRD_PARTY_UNTRACKED) {
        continue; // stok takip edilmiyor
      }
      const owner =
        item.stockSource === SaleStockSource.CONSIGNMENT_TRACKED
          ? dto.ownerCustomerId ?? null
          : null;
      await this.platesService.adjustStock(
        item.plateId,
        warehouse!.id,
        -item.quantity,
        owner,
        manager,
        opts.allowNegativeStock ?? false,
      );
    }

    // Alıcı borçlanır (DEBIT, baz tutarda).
    const buyerBalance = await this.accountService.applyDebit(manager, {
      customerId: dto.buyerCustomerId,
      amount: baseSaleTotal,
      sourceType: LedgerSourceType.SALE,
      sourceId: savedSale.id,
      description: `Satış #${savedSale.id.slice(0, 8)}`,
      occurredAt: saleDate,
    });

    // Üçüncü kişi sahibi alacaklanır (CREDIT, baz tutarda).
    let ownerBalance: number | undefined;
    if (dto.ownerCustomerId && baseOwnerAmount > 0) {
      ownerBalance = await this.accountService.applyCredit(manager, {
        customerId: dto.ownerCustomerId,
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
        ownerCustomerId: dto.ownerCustomerId,
        baseSaleTotal,
        baseOwnerAmount,
        businessMargin: roundMoney(baseSaleTotal - baseOwnerAmount),
      },
    };
  }

  async findAll(query: QuerySaleDto): Promise<PaginatedResult<Sale>> {
    const where: FindOptionsWhere<Sale> = {};
    if (query.buyerCustomerId) where.buyerCustomerId = query.buyerCustomerId;
    if (query.ownerCustomerId) where.ownerCustomerId = query.ownerCustomerId;
    if (query.from && query.to) {
      where.saleDate = Between(new Date(query.from), new Date(query.to));
    }
    const [items, total] = await this.salesRepo.findAndCount({
      where,
      order: { saleDate: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Sale> {
    const sale = await this.salesRepo.findOne({ where: { id } });
    if (!sale) {
      throw new NotFoundException('Satış kaydı bulunamadı.');
    }
    return sale;
  }

  /** Bir kalemin satır toplamını ve (varsa) sahip payını hesaplar. */
  private computeItem(
    item: SaleItemDto,
    hasOwner: boolean,
  ): { lineTotal: number; ownerAmount: number } {
    const lineTotal = lineTotalOf(item.quantity, item.unitPrice);

    if (item.stockSource === SaleStockSource.BUSINESS) {
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
}
