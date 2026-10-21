import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../common/dto/paginated-result';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { ShopContext } from '../../common/shop/shop-context';
import { can } from '../../common/shop/shop-permissions';
import { roundMoney, totalAreaM2 } from '../../common/utils/area.util';
import { CustomerAccountService } from '../customers/services/customer-account.service';
import { Customer } from '../customers/entities/customer.entity';
import { BatchPlateItemDto } from '../materials/dto/batch-create-plates.dto';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { MaterialSize } from '../materials/entities/material-size.entity';
import { MaterialTemplate } from '../materials/entities/material-template.entity';
import { StockLevel } from '../materials/entities/stock-level.entity';
import { PlateIntakeService } from '../materials/services/plate-intake.service';
import { PlatesService } from '../materials/services/plates.service';
import { PurchaseOrder } from '../purchases/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../purchases/entities/purchase-order-item.entity';
import { SalesService } from '../sales/sales.service';
import { Shop } from '../shops/entities/shop.entity';
import {
  ShopAccessInfo,
  ShopAccessService,
  ShopActor,
} from '../shops/shop-access.service';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { WarehousesService } from '../warehouses/warehouses.service';
import {
  CreateShopTransferDto,
  QueryShopTransferDto,
} from './dto/create-shop-transfer.dto';
import { ShopTransferItem } from './entities/shop-transfer-item.entity';
import { ShopTransfer, ShopTransferStatus } from './entities/shop-transfer.entity';

/** Alan dükkândaki parçanın bugünkü durumu. */
export type TransferItemState =
  | 'in_stock' // hiç kullanılmadı, olduğu gibi stokta
  | 'partial' // bir kısmı satıldı/işlendi, kalanı stokta
  | 'sold' // tamamı satıldı/işlendi
  | 'removed' // satış kaydı olmadan stoktan çıktı (elle silme vb.)
  | 'cancelled'; // belge iptal edildi

/** Alan dükkânda malzemenin sonraki bir kullanımı (satış ya da işleme). */
export interface TransferUsage {
  kind: 'sale' | 'processing';
  at: string;
  /** Alıcı müşteri — görme yetkisi yoksa null. */
  customerName: string | null;
  /** Müşteri başka bir dükkânı temsil ediyorsa o dükkânın adı (zincir satış). */
  toShopName: string | null;
  quantity: number;
  widthMm: number | null;
  heightMm: number | null;
  /** Satış tutarı (işlemede ve yetki yoksa null). */
  amount: number | null;
  currency: string;
  /** İşleme işinin durumu (bekliyor / tamamlandı ...). */
  status?: string;
}

export interface ShopTransferItemView {
  id: string;
  sourcePlateId: string;
  targetPlateId: string | null;
  plateName: string;
  categoryName: string | null;
  measurementType: MeasurementType;
  quantity: number;
  widthMm: number | null;
  heightMm: number | null;
  unitPrice: number;
  lineTotal: number;
  state: TransferItemState;
  /** Kalan oranı (0–1): tabakada kalan alan, diğerlerinde kalan miktar. */
  remainingRatio: number;
  usages: TransferUsage[];
}

export interface ShopTransferView {
  id: string;
  transferNo: string;
  transferDate: Date;
  status: ShopTransferStatus;
  currency: string;
  totalAmount: number;
  note: string | null;
  fromShop: { id: string; name: string };
  toShop: { id: string; name: string };
  /** Seçili dükkâna göre: out = biz sattık, in = biz aldık. */
  direction: 'out' | 'in';
  createdBy: { id: string; fullName: string } | null;
  cancelledAt: Date | null;
  saleId: string | null;
  purchaseOrderId: string | null;
  /** Alan dükkândaki müşteri adları/tutarları görülebiliyor mu? */
  detailVisible: boolean;
  /** Hiçbir parça kullanılmadıysa satan dükkân belgeyi geri alabilir. */
  canCancel: boolean;
  summary: { items: number; inStock: number; partial: number; sold: number };
  items: ShopTransferItemView[];
}

/** Hedef dükkân seçimi. */
export interface TransferTarget {
  id: string;
  name: string;
  /** Kullanıcı o dükkânda stok girişi (satın alma) yapabiliyor mu? */
  canSell: boolean;
}

/** Bir satır: satan dükkândaki kalem + hesaplanmış ölçü ve tutar. */
interface Line {
  plate: MaterialPlate;
  area: boolean;
  quantity: number;
  widthMm: number | null;
  heightMm: number | null;
  unitPrice: number;
  lineTotal: number;
}

interface PlateStateRow {
  id: string;
  measurement_type: MeasurementType;
  width_mm: string | null;
  height_mm: string | null;
  quantity_in_stock: string;
  deleted_at: Date | null;
}

interface UsageRow {
  plate_id: string;
  kind: 'sale' | 'processing';
  at: Date;
  customer_name: string | null;
  linked_shop_id: string | null;
  quantity: string;
  width_mm: string | null;
  height_mm: string | null;
  amount: string | null;
  currency: string;
  status: string | null;
}

/**
 * Tutarı `count` parçaya böler; kuruş farkı son parçaya yazılır ki parçaların
 * toplamı satış tutarına tam eşit olsun (alan dükkânın alışı = satanın satışı).
 */
export function splitAmount(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const each = roundMoney(total / n);
  const parts = Array.from({ length: n }, () => each);
  parts[n - 1] = roundMoney(total - each * (n - 1));
  return parts;
}

/**
 * Parçanın alan dükkândaki durumu: kalan ölçü/miktar belgedekiyle
 * karşılaştırılır; sonraki kullanım (satış/işleme) varsa "satıldı" sayılır.
 */
export function itemState(
  item: Pick<ShopTransferItem, 'measurementType' | 'quantity' | 'widthMm' | 'heightMm' | 'targetPlateId'>,
  plate: PlateStateRow | undefined,
  usageCount: number,
  cancelled: boolean,
): { state: TransferItemState; remainingRatio: number } {
  if (cancelled || !item.targetPlateId) return { state: 'cancelled', remainingRatio: 0 };
  let ratio = 0;
  if (plate && !plate.deleted_at) {
    if (item.measurementType === MeasurementType.AREA) {
      const original = (Number(item.widthMm) || 0) * (Number(item.heightMm) || 0);
      const now = (Number(plate.width_mm) || 0) * (Number(plate.height_mm) || 0);
      ratio = original > 0 ? now / original : 0;
    } else {
      const original = Number(item.quantity) || 0;
      const now = Math.max(0, Number(plate.quantity_in_stock) || 0);
      ratio = original > 0 ? now / original : 0;
    }
  }
  ratio = Math.max(0, Math.min(1, ratio));
  if (ratio >= 0.999 && usageCount === 0) return { state: 'in_stock', remainingRatio: 1 };
  if (ratio <= 0.001) return { state: usageCount ? 'sold' : 'removed', remainingRatio: 0 };
  return { state: 'partial', remainingRatio: Math.round(ratio * 1000) / 1000 };
}

/**
 * Dükkânlar arası malzeme satışı.
 *
 * Satan dükkân (seçili dükkân) stoğundaki malzemeyi başka bir dükkâna satar.
 * Tek veritabanı transaction'ında:
 *  1) satan dükkânda alan dükkânı temsil eden cariye SATIŞ yazılır (stok düşer,
 *     cari borçlanır — tahsilatı normal ödeme olarak girilir),
 *  2) alan dükkânda satan dükkânı temsil eden tedarikçiden ALIŞ yazılır;
 *     her kalem (tabakada her parça) yeni bir stok kalemi olarak girer ve alış
 *     fiyatı o kalemin maliyeti olur (kâr hesabı bunun üzerinden),
 *  3) iki kaydı birbirine bağlayan belge (DA-YYYY-NNNN) saklanır.
 *
 * İzlenebilirlik: belge her parçanın alan dükkândaki karşılığını tutar; parça
 * orada satılır/işlenirse belge bunu (müşteri, tarih, miktar) gösterir.
 */
@Injectable()
export class ShopTransfersService {
  private readonly logger = new Logger(ShopTransfersService.name);
  private readonly defaultCurrency: string;
  private readonly defaultWarehouseCode: string;

  constructor(
    @InjectRepository(ShopTransfer)
    private readonly transfersRepo: Repository<ShopTransfer>,
    @InjectRepository(Shop) private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(Supplier)
    private readonly suppliersRepo: Repository<Supplier>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    @InjectRepository(MaterialSize)
    private readonly sizesRepo: Repository<MaterialSize>,
    private readonly access: ShopAccessService,
    private readonly salesService: SalesService,
    private readonly platesService: PlatesService,
    private readonly intake: PlateIntakeService,
    private readonly warehousesService: WarehousesService,
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

  /** Malzeme satılabilecek (seçili dükkân dışındaki açık) dükkânlar. */
  async targets(actor: ShopActor): Promise<TransferTarget[]> {
    const current = ShopContext.requireShopId();
    const shops = await this.access.listFor(actor);
    return shops
      .filter((s) => s.id !== current && s.isActive)
      .map((s) => ({
        id: s.id,
        name: s.name,
        canSell: can(s.permissions, 'purchases', 'write'),
      }));
  }

  async create(dto: CreateShopTransferDto, actor: ShopActor): Promise<ShopTransferView> {
    const fromShopId = ShopContext.requireShopId();
    if (dto.toShopId === fromShopId) {
      throw new BadRequestException('Malzeme aynı dükkâna satılamaz; başka bir dükkân seçin.');
    }
    const target = await this.targetAccess(actor, dto.toShopId);
    const fromShop = await this.shopsRepo.findOneOrFail({ where: { id: fromShopId } });

    const currency = (dto.currency ?? this.defaultCurrency).toUpperCase();
    const transferDate = dto.transferDate ? new Date(dto.transferDate) : new Date();
    const lines = await this.buildLines(dto);

    // ── Hazırlık (transaction dışında, tekrar çalıştırılması zararsız) ──
    // Kataloğun karşı dükkândaki karşılıkları ve iki tarafı temsil eden
    // cari/tedarikçi ADLA bulunur ya da açılır. Satış çekirdeği müşteriyi
    // transaction dışından okuduğundan cari önceden kaydedilmiş olmalıdır.
    const catalog = await this.sourceCatalog(lines);
    const buyer = await this.linkedCustomer(dto.toShopId, target.shopName);
    const { supplier, templateIds } = await ShopContext.forShop(dto.toShopId, async () => {
      const templateIds = new Map<string, string>();
      for (const [plateId, item] of catalog) {
        templateIds.set(plateId, await this.intake.resolveTemplateByNames(item));
      }
      return {
        supplier: await this.linkedSupplier(fromShopId, fromShop.name),
        templateIds,
      };
    });

    const { transferId, saleEvent } = await this.dataSource.transaction(async (manager) => {
      // Belge numarası bütün dükkânlarda tek sıradır: eşzamanlı iki satış aynı
      // numarayı almasın diye transaction boyunca kilitlenir.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('shop_transfers.no'))`);
      const transferNo = await this.nextNo(manager);
      const note = [`${transferNo} · ${target.shopName} dükkânına`, dto.note?.trim()]
        .filter(Boolean)
        .join(' — ');

      // 1) Satan dükkânda satış: stok düşer, alan dükkânın carisi borçlanır.
      const { result, event } = await this.salesService.persist(
        manager,
        {
          buyerCustomerId: buyer.id,
          warehouseId: dto.warehouseId,
          saleDate: transferDate.toISOString(),
          currency,
          note,
          items: lines.map((l) => ({
            plateId: l.plate.id,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            widthMm: l.widthMm ?? undefined,
            heightMm: l.heightMm ?? undefined,
          })),
        },
        actor.id,
      );

      // 2) Alan dükkânda alış: her kalem yeni stok kalemi olarak girer.
      const received = await ShopContext.forShop(dto.toShopId, () =>
        this.receive(manager, {
          lines,
          templateIds,
          supplierId: supplier.id,
          actorId: actor.id,
          transferDate,
          currency,
          note: [`${transferNo} · ${fromShop.name} dükkânından`, dto.note?.trim()]
            .filter(Boolean)
            .join(' — '),
        }),
      );

      // 3) İki kaydı bağlayan belge.
      const transfer = await manager.save(
        manager.create(ShopTransfer, {
          transferNo,
          fromShopId,
          toShopId: dto.toShopId,
          transferDate,
          status: ShopTransferStatus.COMPLETED,
          currency,
          totalAmount: result.sale.saleTotal,
          note: dto.note?.trim() || null,
          saleId: result.sale.id,
          buyerCustomerId: buyer.id,
          purchaseOrderId: received.purchaseOrderId,
          supplierId: supplier.id,
          createdById: actor.id,
          items: received.items.map((it) => manager.create(ShopTransferItem, it)),
        }),
      );
      return { transferId: transfer.id, saleEvent: event };
    });

    this.eventEmitter.emit('sale.created', saleEvent);
    this.logger.log(`Dükkânlar arası satış: ${fromShop.name} → ${target.shopName} (${lines.length} kalem).`);
    return this.findOne(transferId, actor);
  }

  async findAll(
    query: QueryShopTransferDto,
    info: ShopAccessInfo,
    actor: ShopActor,
  ): Promise<PaginatedResult<ShopTransferView>> {
    const shopId = info.shopId;
    const canOut = can(info.permissions, 'sales', 'read');
    const canIn = can(info.permissions, 'purchases', 'read');
    if (query.direction === 'out' && !canOut) {
      throw new ForbiddenException('Satışları görme yetkiniz yok.');
    }
    if (query.direction === 'in' && !canIn) {
      throw new ForbiddenException('Satın almaları görme yetkiniz yok.');
    }
    if (!canOut && !canIn) {
      throw new ForbiddenException('Dükkânlar arası satışları görme yetkiniz yok.');
    }
    const out = query.direction !== 'in' && canOut;
    const inc = query.direction !== 'out' && canIn;

    const qb = this.transfersRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fromShop', 'fs')
      .leftJoinAndSelect('t.toShop', 'ts')
      .leftJoinAndSelect('t.items', 'i')
      .leftJoin('t.createdBy', 'u')
      .addSelect(['u.id', 'u.fullName'])
      .where(
        new Brackets((w) => {
          if (out) w.orWhere('t.from_shop_id = :shopId', { shopId });
          if (inc) w.orWhere('t.to_shop_id = :shopId', { shopId });
        }),
      );
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('t.transfer_no ILIKE :q')
            .orWhere('fs.name ILIKE :q')
            .orWhere('ts.name ILIKE :q')
            .orWhere(
              `EXISTS (SELECT 1 FROM shop_transfer_items si
                        WHERE si.transfer_id = t.id AND si.plate_name ILIKE :q)`,
            );
        }),
        { q: `%${search}%` },
      );
    }
    qb.orderBy('t.transferDate', 'DESC')
      .addOrderBy('t.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const items = await this.decorate(rows, info, actor);
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string, actor: ShopActor, info?: ShopAccessInfo): Promise<ShopTransferView> {
    const shopId = ShopContext.requireShopId();
    const access = info ?? (await this.access.resolve(actor, shopId));
    const transfer = await this.transfersRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fromShop', 'fs')
      .leftJoinAndSelect('t.toShop', 'ts')
      .leftJoinAndSelect('t.items', 'i')
      .leftJoin('t.createdBy', 'u')
      .addSelect(['u.id', 'u.fullName'])
      .where('t.id = :id', { id })
      .getOne();
    const visible =
      transfer &&
      ((transfer.fromShopId === shopId && can(access.permissions, 'sales', 'read')) ||
        (transfer.toShopId === shopId && can(access.permissions, 'purchases', 'read')));
    if (!transfer || !visible) {
      throw new NotFoundException('Dükkânlar arası satış kaydı bulunamadı.');
    }
    const [view] = await this.decorate([transfer], access, actor);
    return view;
  }

  /**
   * Belgeyi geri alır — yalnız satan dükkândan ve alan dükkânda hiçbir parça
   * henüz kullanılmadıysa (satılmadı, işlenmedi, teklife eklenmedi, kesilmedi).
   * Satan dükkânda satış geri alınır (stok iade, cari düzeltilir); alan
   * dükkânda alış ve açılan stok kalemleri silinir. Belge "iptal" olarak kalır.
   */
  async cancel(id: string, actor: ShopActor): Promise<ShopTransferView> {
    const shopId = ShopContext.requireShopId();
    const transfer = await this.transfersRepo.findOne({ where: { id }, relations: { items: true } });
    if (!transfer || transfer.fromShopId !== shopId) {
      throw new NotFoundException('Dükkânlar arası satış kaydı bulunamadı (yalnız satan dükkân geri alabilir).');
    }
    if (transfer.status !== ShopTransferStatus.COMPLETED) {
      throw new BadRequestException('Bu belge zaten iptal edilmiş.');
    }
    await this.targetAccess(actor, transfer.toShopId, true);

    try {
      await this.cancelInTransaction(transfer, actor);
    } catch (err) {
      // Alan dükkânda kaleme sonradan bağlanan bir kayıt (ör. aynı kaleme
      // girilen ayrı bir alış) silmeyi engellerse anlaşılır bir ileti ver;
      // transaction geri alındığından hiçbir şey değişmez.
      if (err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23503') {
        throw new BadRequestException(
          'Malzeme alan dükkânda başka kayıtlara bağlanmış (ör. ayrı bir alış); belge geri alınamaz.',
        );
      }
      throw err;
    }
    return this.findOne(id, actor);
  }

  private async cancelInTransaction(transfer: ShopTransfer, actor: ShopActor): Promise<void> {
    const id = transfer.id;
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(ShopTransfer, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || locked.status !== ShopTransferStatus.COMPLETED) {
        throw new BadRequestException('Bu belge zaten iptal edilmiş.');
      }
      const plateIds = transfer.items
        .map((i) => i.targetPlateId)
        .filter((v): v is string => !!v);
      const blocker = await this.cancelBlocker(manager, transfer.items, plateIds);
      if (blocker) throw new BadRequestException(blocker);

      // Satan dükkân: satış geri alınır (stok iade + cari).
      if (transfer.saleId) {
        const affected = await this.salesService.reverseSale(manager, transfer.saleId);
        for (const customerId of affected) {
          await this.accountService.recomputeBalances(manager, customerId);
        }
      }

      // Alan dükkân: alış ve açılan stok kalemleri silinir.
      await ShopContext.forShop(transfer.toShopId, async () => {
        if (transfer.purchaseOrderId) {
          await manager.delete(PurchaseOrderItem, { purchaseOrderId: transfer.purchaseOrderId });
          await manager.delete(PurchaseOrder, { id: transfer.purchaseOrderId });
        }
        if (plateIds.length) {
          await manager.delete(StockLevel, { plateId: In(plateIds) });
          await manager.delete(MaterialPlate, { id: In(plateIds) });
        }
      });

      await manager.update(
        ShopTransfer,
        { id },
        {
          status: ShopTransferStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: actor.id,
        },
      );
    });
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────

  /**
   * Kullanıcının alan dükkândaki erişimi: stok girişi (satın alma yazma)
   * yetkisi gerekir — malzemeyi o dükkânın stoğuna o yazar.
   */
  private async targetAccess(
    actor: ShopActor,
    shopId: string,
    cancelling = false,
  ): Promise<ShopAccessInfo> {
    let info: ShopAccessInfo;
    try {
      info = await this.access.resolve(actor, shopId);
    } catch {
      throw new ForbiddenException('Alıcı dükkâna erişiminiz yok.');
    }
    if (!info.shopActive) {
      throw new BadRequestException(`"${info.shopName}" dükkânı kapalı.`);
    }
    if (!can(info.permissions, 'purchases', 'write')) {
      throw new ForbiddenException(
        `"${info.shopName}" dükkânında satın alma (stok girişi) yetkiniz yok; ` +
          (cancelling ? 'belge geri alınamaz.' : 'malzeme o dükkâna satılamaz.'),
      );
    }
    return info;
  }

  /** Satılacak kalemleri yükler, ölçü ve tutarları hesaplar. */
  private async buildLines(dto: CreateShopTransferDto): Promise<Line[]> {
    const ids = [...new Set(dto.items.map((i) => i.plateId))];
    const plates = await this.platesRepo.find({ where: { id: In(ids) } });
    const byId = new Map(plates.map((p) => [p.id, p]));
    return dto.items.map((item) => {
      const plate = byId.get(item.plateId);
      if (!plate) {
        throw new NotFoundException('Satılacak malzeme bu dükkânın stoğunda bulunamadı.');
      }
      const area = plate.measurementType === MeasurementType.AREA;
      if (!area) {
        return {
          plate,
          area,
          quantity: item.quantity,
          widthMm: null,
          heightMm: null,
          unitPrice: item.unitPrice,
          lineTotal: roundMoney(item.quantity * item.unitPrice),
        };
      }
      if (!Number.isInteger(item.quantity)) {
        throw new BadRequestException(`"${plate.name}": tabaka/parça adedi tam sayı olmalı.`);
      }
      // Ölçü verilmezse kalan tabakanın tamamı satılır.
      const widthMm = item.widthMm ?? Number(plate.widthMm);
      const heightMm = item.heightMm ?? Number(plate.heightMm);
      if (!(widthMm > 0) || !(heightMm > 0)) {
        throw new BadRequestException(`"${plate.name}": satılacak parçanın ölçüsü belirlenemedi.`);
      }
      const m2 = totalAreaM2(widthMm, heightMm, item.quantity);
      return {
        plate,
        area,
        quantity: item.quantity,
        widthMm,
        heightMm,
        unitPrice: item.unitPrice,
        lineTotal: roundMoney(m2 * item.unitPrice),
      };
    });
  }

  /**
   * Satan dükkândaki kalemin katalog bilgisi ADLARLA (tür, marka, renk,
   * kalınlık, standart tabaka) — karşı dükkânda aynı malzemeyi bulmak için.
   */
  private async sourceCatalog(lines: Line[]): Promise<Map<string, BatchPlateItemDto>> {
    const out = new Map<string, BatchPlateItemDto>();
    for (const { plate } of lines) {
      if (out.has(plate.id)) continue;
      const t = plate.template;
      const size =
        plate.sizeId && plate.sizeId !== t?.defaultSizeId
          ? await this.sizesRepo.findOne({ where: { id: plate.sizeId } })
          : t?.defaultSize ?? null;
      const thickness = plate.thicknessMm ?? t?.defaultThickness?.valueMm;
      out.set(plate.id, {
        categoryName: t?.category?.name ?? 'Diğer',
        templateName: t?.name,
        brandName: plate.brand ?? t?.defaultBrand?.name ?? undefined,
        colorName: plate.color ?? t?.defaultColor?.name ?? undefined,
        colorCode: plate.colorCode ?? t?.defaultColor?.code ?? undefined,
        thicknessMm: thickness != null ? Number(thickness) : undefined,
        sheetWidthMm: size ? Number(size.widthMm) : undefined,
        sheetHeightMm: size ? Number(size.heightMm) : undefined,
        measurementType: plate.measurementType,
        variant: plate.variant ?? undefined,
      } as BatchPlateItemDto);
    }
    return out;
  }

  /** Seçili dükkânda, verilen dükkânı temsil eden cari (yoksa açılır). */
  private async linkedCustomer(shopId: string, name: string): Promise<Customer> {
    const found = await this.customersRepo.findOne({ where: { linkedShopId: shopId } });
    if (found) return found;
    return this.customersRepo.save(
      this.customersRepo.create({
        name,
        companyName: `${name} (dükkân)`,
        linkedShopId: shopId,
        openingBalance: 0,
        currentBalance: 0,
        isActive: true,
      }),
    );
  }

  /** Seçili dükkânda, verilen dükkânı temsil eden tedarikçi (yoksa açılır). */
  private async linkedSupplier(shopId: string, name: string): Promise<Supplier> {
    const found = await this.suppliersRepo.findOne({ where: { linkedShopId: shopId } });
    if (found) return found;
    return this.suppliersRepo.save(
      this.suppliersRepo.create({
        name,
        notes: 'Dükkânlar arası alışlarda kendiliğinden açıldı.',
        linkedShopId: shopId,
        isActive: true,
      }),
    );
  }

  /**
   * Alan dükkânda (bağlam: alan dükkân) stok kalemlerini açar, stoğa girer ve
   * alış kaydını yazar. Tabakada her parça ayrı kalemdir.
   */
  private async receive(
    manager: EntityManager,
    opts: {
      lines: Line[];
      templateIds: Map<string, string>;
      supplierId: string;
      actorId: string;
      transferDate: Date;
      currency: string;
      note: string;
    },
  ): Promise<{ purchaseOrderId: string; items: Partial<ShopTransferItem>[] }> {
    const warehouse = await this.warehousesService.resolveDefault(
      this.defaultWarehouseCode,
      manager,
    );
    const addedAt = opts.transferDate.toISOString().slice(0, 10);
    const orderItems: PurchaseOrderItem[] = [];
    const items: Partial<ShopTransferItem>[] = [];

    for (const line of opts.lines) {
      const src = line.plate;
      const templateId = opts.templateIds.get(src.id)!;
      const template = await manager.findOne(MaterialTemplate, { where: { id: templateId } });
      // Tabakada her parça ayrı stok kalemi (kesim modeli tek parçalıktır).
      const amounts = line.area ? splitAmount(line.lineTotal, line.quantity) : [line.lineTotal];
      for (const amount of amounts) {
        const qty = line.area ? 1 : line.quantity;
        const plate = await manager.save(
          manager.create(MaterialPlate, {
            templateId,
            measurementType: src.measurementType,
            unitOfMeasure: src.unitOfMeasure,
            name: src.name,
            sku: (await this.freeSku(manager, src.sku)) ?? undefined,
            brand: src.brand,
            brandId: template?.defaultBrandId ?? null,
            color: src.color,
            colorCode: src.colorCode,
            colorId: template?.defaultColorId ?? null,
            variant: src.variant,
            widthMm: line.widthMm,
            heightMm: line.heightMm,
            sizeId: template?.defaultSizeId ?? null,
            thicknessMm: src.thicknessMm ?? null,
            thicknessId: template?.defaultThicknessId ?? null,
            attributes: src.attributes ?? {},
            quantityInStock: 0,
            reorderLevel: undefined,
            addedAt,
            processedAt: null,
            // Liste fiyatı taşınır (fiyat önerisi boş kalmasın); kâr yüzdesi
            // dükkâna özeldir, taşınmaz.
            retailPrice: src.retailPrice ?? null,
            retailCurrency: src.retailCurrency ?? 'TRY',
            markupPercent: null,
            isActive: true,
          }),
        );
        await this.platesService.adjustStock(plate.id, warehouse.id, qty, null, manager);
        orderItems.push(
          manager.create(PurchaseOrderItem, {
            plateId: plate.id,
            quantity: qty,
            // Tabakada parça başına fiyat; maliyet parça ölçüsünden m²'ye çevrilir.
            unitPrice: line.area ? amount : line.unitPrice,
            lineTotal: amount,
            widthMm: line.widthMm,
            heightMm: line.heightMm,
          }),
        );
        items.push({
          lineNo: items.length + 1,
          sourcePlateId: src.id,
          targetPlateId: plate.id,
          plateName: src.name,
          categoryName: src.template?.category?.name ?? null,
          measurementType: src.measurementType,
          quantity: qty,
          widthMm: line.widthMm,
          heightMm: line.heightMm,
          unitPrice: line.unitPrice,
          lineTotal: amount,
        });
      }
    }

    const order = await manager.save(
      manager.create(PurchaseOrder, {
        supplierId: opts.supplierId,
        warehouseId: warehouse.id,
        purchasedById: opts.actorId,
        purchaseDate: opts.transferDate,
        currency: opts.currency,
        note: opts.note,
        totalAmount: roundMoney(orderItems.reduce((s, it) => s + Number(it.lineTotal), 0)),
        items: orderItems,
      }),
    );
    return { purchaseOrderId: order.id, items };
  }

  /**
   * Stok kodu alan dükkânda boşsa aynen, doluysa "-2", "-3" ekiyle (stok kodu
   * dükkân içinde benzersizdir; silinmiş kalemler de sayılır).
   */
  private async freeSku(manager: EntityManager, sku?: string | null): Promise<string | null> {
    if (!sku) return null;
    for (let n = 1; n < 500; n++) {
      const candidate = n === 1 ? sku : `${sku}-${n}`;
      const taken = await manager.count(MaterialPlate, {
        where: { sku: candidate },
        withDeleted: true,
      });
      if (!taken) return candidate;
    }
    return null;
  }

  /** Yıllık sıralı belge numarası (DA-YYYY-NNNN). */
  private async nextNo(manager: EntityManager): Promise<string> {
    const prefix = `DA-${new Date().getFullYear()}-`;
    const rows: { transfer_no: string }[] = await manager.query(
      `SELECT transfer_no FROM shop_transfers WHERE transfer_no LIKE $1
        ORDER BY transfer_no DESC LIMIT 1`,
      [`${prefix}%`],
    );
    const last = rows[0] ? parseInt(rows[0].transfer_no.slice(prefix.length), 10) : 0;
    return `${prefix}${String((Number.isNaN(last) ? 0 : last) + 1).padStart(4, '0')}`;
  }

  /** Geri almayı engelleyen durum (yoksa null). */
  private async cancelBlocker(
    manager: EntityManager,
    items: ShopTransferItem[],
    plateIds: string[],
  ): Promise<string | null> {
    if (!plateIds.length) return null;
    const [used] = await manager.query(
      `SELECT
         (SELECT COUNT(*) FROM sale_items WHERE plate_id = ANY($1) AND deleted_at IS NULL) AS sales,
         (SELECT COUNT(*) FROM processing_jobs WHERE plate_id = ANY($1) AND deleted_at IS NULL) AS jobs,
         (SELECT COUNT(*) FROM quote_items WHERE plate_id = ANY($1) AND deleted_at IS NULL) AS quotes`,
      [plateIds],
    );
    if (Number(used.sales) > 0) {
      return 'Malzemenin bir kısmı alan dükkânda satılmış; belge geri alınamaz.';
    }
    if (Number(used.jobs) > 0) {
      return 'Malzeme alan dükkânda işlenmiş (iş kuyruğunda); belge geri alınamaz.';
    }
    if (Number(used.quotes) > 0) {
      return 'Malzeme alan dükkânda bir teklife eklenmiş; önce tekliften çıkarın.';
    }
    const states = await this.plateStates(manager, plateIds);
    for (const it of items) {
      if (!it.targetPlateId) continue;
      const { state } = itemState(it, states.get(it.targetPlateId), 0, false);
      if (state !== 'in_stock') {
        return `"${it.plateName}" alan dükkânda kesilmiş/stoktan düşülmüş; belge geri alınamaz.`;
      }
    }
    return null;
  }

  /** Alan dükkândaki parçaların bugünkü ölçü/miktarı (silinmişler dahil). */
  private async plateStates(
    manager: EntityManager | DataSource,
    plateIds: string[],
  ): Promise<Map<string, PlateStateRow>> {
    if (!plateIds.length) return new Map();
    const rows: PlateStateRow[] = await manager.query(
      `SELECT id, measurement_type, width_mm, height_mm, quantity_in_stock, deleted_at
         FROM material_plates WHERE id = ANY($1)`,
      [plateIds],
    );
    return new Map(rows.map((r) => [r.id, r]));
  }

  /**
   * Belgelere izleme bilgisini ekler: her parçanın alan dükkândaki durumu ve
   * sonraki satış/işlemeleri. Müşteri adları ve tutarlar, kullanıcı alan
   * dükkânda satışları görebiliyorsa gösterilir.
   */
  private async decorate(
    transfers: ShopTransfer[],
    info: ShopAccessInfo,
    actor: ShopActor,
  ): Promise<ShopTransferView[]> {
    const plateIds = [
      ...new Set(
        transfers.flatMap((t) => t.items.map((i) => i.targetPlateId).filter((v): v is string => !!v)),
      ),
    ];
    const [states, usages] = await Promise.all([
      this.plateStates(this.dataSource, plateIds),
      this.usages(plateIds),
    ]);
    const linkedIds = [...new Set(usages.map((u) => u.linked_shop_id).filter((v): v is string => !!v))];
    const linkedNames = new Map(
      linkedIds.length
        ? (await this.shopsRepo.find({ where: { id: In(linkedIds) }, withDeleted: true })).map((s) => [
            s.id,
            s.name,
          ])
        : [],
    );
    const usageByPlate = new Map<string, UsageRow[]>();
    for (const u of usages) {
      const list = usageByPlate.get(u.plate_id) ?? [];
      list.push(u);
      usageByPlate.set(u.plate_id, list);
    }

    // Alan dükkânda satışları görme yetkisi (dükkân başına bir kez çözülür).
    const detailCache = new Map<string, boolean>();
    const detailFor = async (shopId: string): Promise<boolean> => {
      if (!detailCache.has(shopId)) {
        let ok = false;
        if (shopId === info.shopId) ok = can(info.permissions, 'sales', 'read');
        else {
          try {
            const other = await this.access.resolve(actor, shopId);
            ok = can(other.permissions, 'sales', 'read');
          } catch {
            ok = false;
          }
        }
        detailCache.set(shopId, ok);
      }
      return detailCache.get(shopId)!;
    };

    const views: ShopTransferView[] = [];
    for (const t of transfers) {
      const cancelled = t.status === ShopTransferStatus.CANCELLED;
      const detail = await detailFor(t.toShopId);
      const items = [...(t.items ?? [])]
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((it): ShopTransferItemView => {
          const rows = (it.targetPlateId && usageByPlate.get(it.targetPlateId)) || [];
          const { state, remainingRatio } = itemState(
            it,
            it.targetPlateId ? states.get(it.targetPlateId) : undefined,
            rows.length,
            cancelled,
          );
          return {
            id: it.id,
            sourcePlateId: it.sourcePlateId,
            targetPlateId: it.targetPlateId ?? null,
            plateName: it.plateName,
            categoryName: it.categoryName ?? null,
            measurementType: it.measurementType,
            quantity: Number(it.quantity),
            widthMm: it.widthMm != null ? Number(it.widthMm) : null,
            heightMm: it.heightMm != null ? Number(it.heightMm) : null,
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.lineTotal),
            state,
            remainingRatio,
            usages: cancelled
              ? []
              : rows.map((u) => ({
                  kind: u.kind,
                  at: new Date(u.at).toISOString(),
                  customerName: detail ? u.customer_name : null,
                  toShopName: u.linked_shop_id ? linkedNames.get(u.linked_shop_id) ?? null : null,
                  quantity: Number(u.quantity),
                  widthMm: u.width_mm != null ? Number(u.width_mm) : null,
                  heightMm: u.height_mm != null ? Number(u.height_mm) : null,
                  amount: detail && u.amount != null ? Number(u.amount) : null,
                  currency: u.currency,
                  ...(u.status ? { status: u.status } : {}),
                })),
          };
        });
      const direction: 'out' | 'in' = t.fromShopId === info.shopId ? 'out' : 'in';
      views.push({
        id: t.id,
        transferNo: t.transferNo,
        transferDate: t.transferDate,
        status: t.status,
        currency: t.currency,
        totalAmount: Number(t.totalAmount),
        note: t.note ?? null,
        fromShop: { id: t.fromShopId, name: t.fromShop?.name ?? '—' },
        toShop: { id: t.toShopId, name: t.toShop?.name ?? '—' },
        direction,
        createdBy: t.createdBy ? { id: t.createdBy.id, fullName: t.createdBy.fullName } : null,
        cancelledAt: t.cancelledAt ?? null,
        saleId: t.saleId ?? null,
        purchaseOrderId: t.purchaseOrderId ?? null,
        detailVisible: detail,
        canCancel:
          !cancelled &&
          direction === 'out' &&
          can(info.permissions, 'sales', 'write') &&
          items.every((i) => i.state === 'in_stock'),
        summary: {
          items: items.length,
          inStock: items.filter((i) => i.state === 'in_stock').length,
          partial: items.filter((i) => i.state === 'partial').length,
          sold: items.filter((i) => i.state === 'sold' || i.state === 'removed').length,
        },
        items,
      });
    }
    return views;
  }

  /**
   * Parçaların alan dükkândaki sonraki kullanımları: satış kalemleri ve
   * (iptal edilmemiş) işleme işleri. Ham SQL — iki dükkânı birden kapsar.
   */
  private async usages(plateIds: string[]): Promise<UsageRow[]> {
    if (!plateIds.length) return [];
    return this.dataSource.query(
      `SELECT si.plate_id, 'sale' AS kind, s.sale_date AS at, c.name AS customer_name,
              c.linked_shop_id, si.quantity, si.width_mm, si.height_mm,
              si.line_total AS amount, s.currency, NULL AS status
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id AND s.deleted_at IS NULL
         LEFT JOIN customers c ON c.id = s.buyer_customer_id
        WHERE si.plate_id = ANY($1) AND si.deleted_at IS NULL
       UNION ALL
       SELECT pj.plate_id, 'processing' AS kind, pj.processed_at AS at, c.name AS customer_name,
              c.linked_shop_id, pj.quantity, pj.width_mm, pj.height_mm,
              NULL AS amount, pj.currency, pj.status::text AS status
         FROM processing_jobs pj
         LEFT JOIN customers c ON c.id = pj.customer_id
        WHERE pj.plate_id = ANY($1) AND pj.deleted_at IS NULL AND pj.status::text <> 'cancelled'
        ORDER BY at ASC`,
      [plateIds],
    );
  }
}
