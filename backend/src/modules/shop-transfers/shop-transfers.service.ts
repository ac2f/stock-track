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
import { allocatePlateSkus } from '../materials/plate-sku.util';
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
  ShopTransferItemDto,
} from './dto/create-shop-transfer.dto';
import { RequestShopTransferDto } from './dto/trade.dto';
import { PartnerGrantsService } from './partner-grants.service';
import { StockSharesService } from './stock-shares.service';
import { ShopTransferItem } from './entities/shop-transfer-item.entity';
import { ShopTransfer, ShopTransferStatus } from './entities/shop-transfer.entity';

/** Aynı işletmeye aynı anda bekleyebilecek en çok teklif (spam koruması). */
const MAX_PENDING_PER_PARTNER = 25;

/** Alan dükkândaki parçanın bugünkü durumu. */
export type TransferItemState =
  | 'pending' // onay bekliyor: henüz alan dükkânda kaydı yok
  | 'untracked' // tamamlandı; alan işletme başka bir işletme olduğundan sonraki durumu görülmez
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
  /** Belgeyi başlatan işletme (onaylayan karşı taraftır). */
  initiatorShopId: string;
  /** Teklifi/talebi biz başlattık. */
  initiatedByMe: boolean;
  /** Karşı taraf onayı olmadan (kendi şubeleri / tanınan otomatik onay yetkisi) tamamlandı. */
  autoApproved: boolean;
  decidedAt: Date | null;
  decisionNote: string | null;
  /** Karar BİZİ bekliyor ve onaylayabilir/reddedebiliriz (yetkimiz var). */
  canDecide: boolean;
  /** Bekleyen teklifimizi geri çekebiliriz. */
  canWithdraw: boolean;
  /** İki tarafı da yönetebildiğimiz için tamamlanmış belgeyi hemen geri alabiliriz. */
  canCancel: boolean;
  /** Karşı tarafın onayıyla geri almak için talep açabiliriz. */
  canRequestCancel: boolean;
  /** Açık geri alma talebi (karşı tarafın onayını bekler). */
  cancelRequest: { byShopName: string; byMe: boolean; at: Date | null; note: string | null } | null;
  /** Alan dükkândaki sonraki durum (satıldı/işlendi ...) görülebiliyor mu? Başka işletmenin stoğu izlenmez. */
  trackingVisible: boolean;
  summary: { items: number; inStock: number; partial: number; sold: number };
  items: ShopTransferItemView[];
}

/** Hedef dükkân seçimi. */
export interface TransferTarget {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  /** Kullanıcının kendi (başka) dükkânı: karşı onay gerekmez. */
  own: boolean;
  /** Kendi dükkânıysa: orada stok girişi (satın alma) yetkisi var mı? */
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
    private readonly partners: PartnerGrantsService,
    private readonly stockShares: StockSharesService,
    configService: ConfigService,
  ) {
    this.defaultCurrency =
      configService.get<string>('business.defaultCurrency') ?? 'TRY';
    this.defaultWarehouseCode =
      configService.get<string>('business.defaultWarehouseCode') ?? 'MERKEZ';
  }

  /**
   * Teklif/talep edilebilecek işletmeler: kullanıcının kendi diğer dükkânları, rehberde
   * görünenler ve daha önce yetki/işlem ilişkisi olduklarım (arama zorunlu değildir; en çok 25).
   */
  async targets(actor: ShopActor, info: ShopAccessInfo, q?: string): Promise<TransferTarget[]> {
    const mine = (await this.access.listFor(actor)).filter((s) => s.isActive).map((s) => s.id);
    const list = await this.partners.search(info, mine, q);
    return Promise.all(
      list.map(async (c) => ({
        id: c.id,
        name: c.name,
        province: c.province,
        district: c.district,
        own: c.own,
        // Kendi dükkânımsa karşı tarafın onayı gerekmez (stok girişi yetkim varsa).
        canSell: c.own ? await this.canActIn(actor, c.id, 'purchases', 'write') : false,
      })),
    );
  }

  /** Satıcı olarak başka işletmeye satış teklifi (onaylanınca ya da otomatik onayda gerçekleşir). */
  create(dto: CreateShopTransferDto, actor: ShopActor, info: ShopAccessInfo): Promise<ShopTransferView> {
    return this.propose(
      {
        initiator: 'seller',
        counterpartyShopId: dto.toShopId,
        items: dto.items,
        warehouseId: dto.warehouseId,
        currency: dto.currency,
        transferDate: dto.transferDate,
        note: dto.note,
      },
      actor,
      info,
    );
  }

  /** Alıcı olarak satıcının paylaşılan stoğundan alım talebi. */
  request(dto: RequestShopTransferDto, actor: ShopActor, info: ShopAccessInfo): Promise<ShopTransferView> {
    return this.propose(
      {
        initiator: 'buyer',
        counterpartyShopId: dto.fromShopId,
        items: dto.items,
        currency: dto.currency,
        note: dto.note,
      },
      actor,
      info,
    );
  }

  /**
   * Teklif/talep. Üç sonuçtan biri:
   *  1) kullanıcı karşı dükkânı da yönetebiliyorsa (kendi şubeleri) → doğrudan tamamlanır,
   *  2) karşı işletme bu işletmeye "otomatik onayla" yetkisi vermişse (süresi dolmamış) → tamamlanır,
   *  3) aksi hâlde "onay bekliyor": hiçbir kayıt yazılmaz, karşı taraf onaylar ya da reddeder.
   */
  private async propose(
    a: {
      initiator: 'seller' | 'buyer';
      counterpartyShopId: string;
      items: ShopTransferItemDto[];
      warehouseId?: string;
      currency?: string;
      transferDate?: string;
      note?: string;
    },
    actor: ShopActor,
    info: ShopAccessInfo,
  ): Promise<ShopTransferView> {
    const me = info.shopId;
    if (a.counterpartyShopId === me) {
      throw new BadRequestException('Aynı işletmeye işlem yapılamaz; başka bir işletme seçin.');
    }
    const counter = await this.counterparty(me, a.counterpartyShopId);
    const fromShopId = a.initiator === 'seller' ? me : counter.id;
    const toShopId = a.initiator === 'seller' ? counter.id : me;
    const currency = (a.currency ?? this.defaultCurrency).toUpperCase();

    // Kalemler satıcının bağlamında doğrulanır (stok, ölçü). Alıcı talebinde yalnız satıcının
    // bu işletmeye LİSTELEDİĞİ kalemler istenebilir.
    const lines = await ShopContext.forShop(fromShopId, () => this.buildLines(a.items));
    if (a.initiator === 'buyer') {
      const listed = await this.stockShares.listedTo(fromShopId, me, lines.map((l) => l.plate.id));
      if (lines.some((l) => !listed.has(l.plate.id))) {
        throw new BadRequestException('Seçilen kalemlerden biri satıcının paylaşılan stok listesinde değil.');
      }
    }
    this.assertAvailable(lines);

    // Karşı tarafta da yazma yetkisi olan kişi (kendi şubeleri) onay beklemez.
    const counterModule = a.initiator === 'seller' ? 'purchases' : 'sales';
    const bothSides = await this.canActIn(actor, counter.id, counterModule, 'write');
    let approverId: string | null = null;
    if (bothSides) approverId = actor.id;
    else {
      const grant = await this.partners.active(counter.id, me, 'auto_approve');
      if (grant) approverId = grant.createdById;
    }

    const names = new Map([[me, info.shopName], [counter.id, counter.name]]);
    const fromName = names.get(fromShopId)!;
    const toName = names.get(toShopId)!;
    const meta = { initiatorShopId: me, createdById: actor.id, note: a.note?.trim() || null };

    if (approverId) {
      const transferId = await this.settle({
        fromShopId,
        toShopId,
        fromName,
        toName,
        items: a.items,
        warehouseId: a.warehouseId,
        currency,
        transferDate: a.transferDate ? new Date(a.transferDate) : ShopContext.now(),
        sellerActorId: a.initiator === 'seller' ? actor.id : approverId,
        buyerActorId: a.initiator === 'seller' ? approverId : actor.id,
        autoApproved: true,
        decidedById: approverId,
        ...meta,
      });
      this.notifyOther(counter.id, info.shopName, 'Dükkânlar arası işlem otomatik onaylandı', transferId, (no) =>
        `${info.shopName} ile ${no} numaralı işlem, tanıdığınız yetki gereği otomatik onaylandı.`);
      return this.findOne(transferId, actor, info);
    }

    // Spam koruması: aynı işletmeye aynı anda en çok 25 bekleyen teklif.
    const open = await this.transfersRepo.count({
      where: { initiatorShopId: me, status: ShopTransferStatus.PENDING, ...(a.initiator === 'seller' ? { toShopId } : { fromShopId }) },
    });
    if (open >= MAX_PENDING_PER_PARTNER) {
      throw new BadRequestException('Bu işletmeye bekleyen çok sayıda teklifiniz var; önce onaylanmalarını bekleyin.');
    }

    const transferId = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('shop_transfers.no'))`);
      const transferNo = await this.nextNo(manager);
      const total = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));
      const saved = await manager.save(
        manager.create(ShopTransfer, {
          transferNo,
          fromShopId,
          toShopId,
          initiatorShopId: me,
          transferDate: a.transferDate ? new Date(a.transferDate) : ShopContext.now(),
          status: ShopTransferStatus.PENDING,
          currency,
          totalAmount: total,
          note: meta.note,
          warehouseId: a.warehouseId ?? null,
          createdById: actor.id,
          autoApproved: false,
          items: lines.map((l, i) =>
            manager.create(ShopTransferItem, {
              lineNo: i + 1,
              sourcePlateId: l.plate.id,
              targetPlateId: null,
              plateName: l.plate.name,
              categoryName: l.plate.template?.category?.name ?? null,
              measurementType: l.plate.measurementType,
              quantity: l.quantity,
              widthMm: l.widthMm,
              heightMm: l.heightMm,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
            }),
          ),
        }),
      );
      return saved.id;
    });
    this.notifyOther(counter.id, info.shopName, a.initiator === 'seller' ? 'Yeni satış teklifi — onayınız bekleniyor' : 'Yeni alım talebi — onayınız bekleniyor', transferId, (no) =>
      `${info.shopName} size ${no} numaralı ${a.initiator === 'seller' ? 'satış teklifi' : 'alım talebi'} gönderdi (${lines.length} kalem). İşletmeler Arası ekranından onaylayın ya da reddedin.`);
    this.logger.log(`Dükkânlar arası teklif (bekliyor): ${fromName} → ${toName} (${lines.length} kalem).`);
    return this.findOne(transferId, actor, info);
  }

  /**
   * Onay bekleyen belgeyi gerçekleştirir (karşı taraf onayı) ya da iki tarafı yazar.
   * Seçili işletme (bağlam) hangisi olursa olsun her taraf kendi bağlamında yazılır.
   */
  private async settle(a: {
    fromShopId: string;
    toShopId: string;
    fromName: string;
    toName: string;
    items: { plateId: string; quantity: number; unitPrice: number; widthMm?: number; heightMm?: number }[];
    warehouseId?: string | null;
    currency: string;
    transferDate: Date;
    sellerActorId: string;
    buyerActorId: string;
    initiatorShopId: string;
    createdById: string;
    note: string | null;
    autoApproved: boolean;
    decidedById: string;
    decisionNote?: string | null;
    existingId?: string;
  }): Promise<string> {
    const { fromShopId, toShopId } = a;
    const inFrom = <T>(fn: () => T) => ShopContext.forShop(fromShopId, fn);

    // ── Hazırlık (transaction dışında, tekrar çalıştırılması zararsız) ──
    // Kataloğun karşı dükkândaki karşılıkları ve iki tarafı temsil eden cari/tedarikçi
    // ADLA bulunur ya da açılır. Satış çekirdeği müşteriyi transaction dışından okuduğundan
    // cari önceden kaydedilmiş olmalıdır.
    const lines = await inFrom(() => this.buildLines(a.items));
    const catalog = await inFrom(() => this.sourceCatalog(lines));
    const buyer = await inFrom(() => this.linkedCustomer(toShopId, a.toName));
    const { supplier, templateIds } = await ShopContext.forShop(toShopId, async () => {
      const templateIds = new Map<string, string>();
      for (const [plateId, item] of catalog) {
        templateIds.set(plateId, await this.intake.resolveTemplateByNames(item));
      }
      return { supplier: await this.linkedSupplier(fromShopId, a.fromName), templateIds };
    });

    const { transferId, saleEvent } = await this.dataSource.transaction(async (manager) => {
      let existing: ShopTransfer | null = null;
      if (a.existingId) {
        // Aynı belgenin iki kez onaylanmasına karşı satır kilidi.
        existing = await manager.findOne(ShopTransfer, { where: { id: a.existingId }, lock: { mode: 'pessimistic_write' } });
        if (!existing || existing.status !== ShopTransferStatus.PENDING) {
          throw new BadRequestException('Bu teklif artık onay beklemiyor (başkası karara bağlamış ya da geri çekilmiş).');
        }
      } else {
        // Belge numarası bütün dükkânlarda tek sıradır: eşzamanlı iki işlem aynı numarayı almasın.
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext('shop_transfers.no'))`);
      }
      const transferNo = existing?.transferNo ?? (await this.nextNo(manager));
      const note = [`${transferNo} · ${a.toName} dükkânına`, a.note].filter(Boolean).join(' — ');

      // 1) Satan dükkânda satış: stok düşer, alan dükkânın carisi borçlanır.
      const { result, event } = await inFrom(() =>
        this.salesService.persist(
          manager,
          {
            buyerCustomerId: buyer.id,
            warehouseId: a.warehouseId ?? undefined,
            saleDate: a.transferDate.toISOString(),
            currency: a.currency,
            note,
            items: lines.map((l) => ({
              plateId: l.plate.id,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              widthMm: l.widthMm ?? undefined,
              heightMm: l.heightMm ?? undefined,
            })),
          },
          a.sellerActorId,
        ),
      );

      // 2) Alan dükkânda alış: her kalem yeni stok kalemi olarak girer.
      const received = await ShopContext.forShop(toShopId, () =>
        this.receive(manager, {
          lines,
          templateIds,
          supplierId: supplier.id,
          actorId: a.buyerActorId,
          transferDate: a.transferDate,
          currency: a.currency,
          note: [`${transferNo} · ${a.fromName} dükkânından`, a.note].filter(Boolean).join(' — '),
        }),
      );

      // 3) İki kaydı bağlayan belge (bekleyen belgede başlık güncellenir, kalemler açılır).
      const header = {
        transferDate: a.transferDate,
        status: ShopTransferStatus.COMPLETED,
        currency: a.currency,
        totalAmount: result.sale.saleTotal,
        saleId: result.sale.id,
        buyerCustomerId: buyer.id,
        purchaseOrderId: received.purchaseOrderId,
        supplierId: supplier.id,
        autoApproved: a.autoApproved,
        decidedById: a.decidedById,
        decidedAt: ShopContext.now(),
        decisionNote: a.decisionNote ?? null,
      };
      if (existing) {
        await manager.delete(ShopTransferItem, { transferId: existing.id });
        await manager.update(ShopTransfer, { id: existing.id }, header);
        await manager.save(
          received.items.map((it) => manager.create(ShopTransferItem, { ...it, transferId: existing!.id })),
        );
        return { transferId: existing.id, saleEvent: event };
      }
      const transfer = await manager.save(
        manager.create(ShopTransfer, {
          ...header,
          transferNo,
          fromShopId,
          toShopId,
          initiatorShopId: a.initiatorShopId,
          note: a.note,
          warehouseId: a.warehouseId ?? null,
          createdById: a.createdById,
          items: received.items.map((it) => manager.create(ShopTransferItem, it)),
        }),
      );
      return { transferId: transfer.id, saleEvent: event };
    });

    // Satış bildirimi satan işletmenin bağlamında çalışsın (onaylayan alıcı olabilir).
    inFrom(() => this.eventEmitter.emit('sale.created', saleEvent));
    this.logger.log(`Dükkânlar arası satış: ${a.fromName} → ${a.toName} (${lines.length} kalem).`);
    return transferId;
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
    if (query.status === 'open') {
      // Karar/onay bekleyenler: bekleyen teklifler + açık geri alma talepleri.
      qb.andWhere(
        new Brackets((w) => {
          w.where("t.status = 'pending'").orWhere("t.status = 'completed' AND t.cancel_requested_by_shop_id IS NOT NULL");
        }),
      );
    } else if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
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

  /** Seçili dükkânın karar bekleyen ve başlattığı bekleyen işlem sayıları (menü rozeti). */
  async pendingCount(info: ShopAccessInfo): Promise<{ awaitingMe: number; waitingOthers: number }> {
    const me = info.shopId;
    const canSell = can(info.permissions, 'sales', 'write');
    const canBuy = can(info.permissions, 'purchases', 'write');
    const rows: { initiator: string | null; from_shop_id: string; to_shop_id: string; status: string; cr: string | null }[] =
      await this.dataSource.query(
        `SELECT initiator_shop_id AS initiator, from_shop_id, to_shop_id, status, cancel_requested_by_shop_id AS cr
           FROM shop_transfers
          WHERE deleted_at IS NULL AND (from_shop_id = $1 OR to_shop_id = $1)
            AND (status = 'pending' OR (status = 'completed' AND cancel_requested_by_shop_id IS NOT NULL))`,
        [me],
      );
    let awaitingMe = 0;
    let waitingOthers = 0;
    for (const r of rows) {
      const mySideWrite = r.from_shop_id === me ? canSell : canBuy;
      const starter = r.status === 'pending' ? r.initiator ?? r.from_shop_id : r.cr;
      if (starter === me) waitingOthers += 1;
      else if (mySideWrite) awaitingMe += 1;
    }
    return { awaitingMe, waitingOthers };
  }

  /**
   * Karşı tarafın onayı: bekleyen teklifi gerçekleştirir ya da (tamamlanmış belgede
   * karşı tarafın istediği) geri almayı uygular. Yalnız BAŞLATAN OLMAYAN taraf ve yalnız o
   * tarafta yazma yetkisi olan kişi onaylar.
   */
  async approve(
    id: string,
    actor: ShopActor,
    info: ShopAccessInfo,
    body: { note?: string; warehouseId?: string } = {},
  ): Promise<ShopTransferView> {
    const t = await this.loadMine(id, info);
    const side = t.fromShopId === info.shopId ? 'seller' : 'buyer';
    this.assertSideWrite(info, side);

    if (t.status === ShopTransferStatus.PENDING) {
      if ((t.initiatorShopId ?? t.fromShopId) === info.shopId) {
        throw new ForbiddenException('Kendi teklifinizi kendiniz onaylayamazsınız; karşı işletmenin onayı gerekir.');
      }
      const from = await this.shopName(t.fromShopId);
      const to = await this.shopName(t.toShopId);
      // Karşı taraf (başlatan) hâlâ işlem yapabilir durumda mı: kapatılmış/askıdaki işletmeyle işlem tamamlanmaz.
      await this.counterparty(info.shopId, side === 'seller' ? t.toShopId : t.fromShopId, true);
      const items = t.items.map((i) => ({
        plateId: i.sourcePlateId,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        widthMm: i.widthMm != null ? Number(i.widthMm) : undefined,
        heightMm: i.heightMm != null ? Number(i.heightMm) : undefined,
      }));
      await this.settle({
        fromShopId: t.fromShopId,
        toShopId: t.toShopId,
        fromName: from,
        toName: to,
        items,
        // Satıcı onaylıyorsa kendi çıkış deposunu seçebilir; yoksa teklifteki depo.
        warehouseId: side === 'seller' ? body.warehouseId ?? t.warehouseId : t.warehouseId,
        currency: t.currency,
        transferDate: ShopContext.now(), // işlem gerçekten şimdi olur (eski tarihli kayıt açılmaz)
        sellerActorId: side === 'seller' ? actor.id : t.createdById,
        buyerActorId: side === 'seller' ? t.createdById : actor.id,
        initiatorShopId: t.initiatorShopId ?? t.fromShopId,
        createdById: t.createdById,
        note: t.note ?? null,
        autoApproved: false,
        decidedById: actor.id,
        decisionNote: body.note?.trim() || null,
        existingId: t.id,
      });
      const initiator = t.initiatorShopId ?? t.fromShopId;
      this.notifyOther(initiator, info.shopName, 'Teklifiniz onaylandı', t.id, (no) => `${info.shopName}, ${no} numaralı teklifinizi onayladı.`);
      return this.findOne(t.id, actor, info);
    }

    if (t.status === ShopTransferStatus.COMPLETED && t.cancelRequestedByShopId) {
      if (t.cancelRequestedByShopId === info.shopId) {
        throw new ForbiddenException('Kendi geri alma talebinizi kendiniz onaylayamazsınız.');
      }
      await this.reverse(t, actor);
      this.notifyOther(t.cancelRequestedByShopId, info.shopName, 'Geri alma talebiniz onaylandı', t.id, (no) => `${info.shopName}, ${no} numaralı belgenin geri alınmasını onayladı.`);
      return this.findOne(t.id, actor, info);
    }
    throw new BadRequestException('Bu belge onay beklemiyor.');
  }

  /** Karşı tarafın reddi: bekleyen teklifi ya da geri alma talebini reddeder. Hiçbir kayıt değişmez. */
  async reject(id: string, actor: ShopActor, info: ShopAccessInfo, note?: string): Promise<ShopTransferView> {
    const t = await this.loadMine(id, info);
    const side = t.fromShopId === info.shopId ? 'seller' : 'buyer';
    this.assertSideWrite(info, side);

    if (t.status === ShopTransferStatus.PENDING) {
      const initiator = t.initiatorShopId ?? t.fromShopId;
      if (initiator === info.shopId) {
        throw new ForbiddenException('Kendi teklifinizi reddedemezsiniz; geri çekin.');
      }
      const res = await this.transfersRepo.update(
        { id: t.id, status: ShopTransferStatus.PENDING },
        { status: ShopTransferStatus.REJECTED, decidedById: actor.id, decidedAt: ShopContext.now(), decisionNote: note?.trim() || null },
      );
      if (!res.affected) throw new BadRequestException('Bu teklif artık onay beklemiyor.');
      this.notifyOther(initiator, info.shopName, 'Teklifiniz reddedildi', t.id, (no) => `${info.shopName}, ${no} numaralı teklifinizi reddetti.${note?.trim() ? ` Not: ${note.trim()}` : ''}`);
      return this.findOne(t.id, actor, info);
    }
    if (t.status === ShopTransferStatus.COMPLETED && t.cancelRequestedByShopId) {
      if (t.cancelRequestedByShopId === info.shopId) {
        throw new ForbiddenException('Kendi geri alma talebinizi reddedemezsiniz; vazgeçin.');
      }
      const starter = t.cancelRequestedByShopId;
      await this.transfersRepo.update(
        { id: t.id },
        { cancelRequestedByShopId: null, cancelRequestedById: null, cancelRequestedAt: null, cancelNote: null },
      );
      this.notifyOther(starter, info.shopName, 'Geri alma talebiniz reddedildi', t.id, (no) => `${info.shopName}, ${no} numaralı belgenin geri alınmasını reddetti.${note?.trim() ? ` Not: ${note.trim()}` : ''}`);
      return this.findOne(t.id, actor, info);
    }
    throw new BadRequestException('Bu belge onay beklemiyor.');
  }

  /**
   * İptal:
   *  - bekleyen teklif/talep: başlatan taraf geri çeker,
   *  - tamamlanmış belge: iki tarafı da yönetebilen kişi hemen geri alır (stok iade, cari düzelir);
   *    diğerleri geri alma TALEBİ açar, karşı taraf onaylayınca uygulanır. Alan dükkânda parça
   *    kullanılmışsa (satıldı/işlendi/kesildi) geri alma hiçbir yoldan yapılamaz.
   *  - başlattığı geri alma talebinden vazgeçme.
   */
  async cancel(id: string, actor: ShopActor, info: ShopAccessInfo, note?: string): Promise<ShopTransferView> {
    const t = await this.loadMine(id, info);
    const side = t.fromShopId === info.shopId ? 'seller' : 'buyer';
    this.assertSideWrite(info, side);
    const other = side === 'seller' ? t.toShopId : t.fromShopId;

    if (t.status === ShopTransferStatus.PENDING) {
      if ((t.initiatorShopId ?? t.fromShopId) !== info.shopId) {
        throw new ForbiddenException('Teklifi yalnız başlatan işletme geri çekebilir; karşı taraf reddeder.');
      }
      const res = await this.transfersRepo.update(
        { id: t.id, status: ShopTransferStatus.PENDING },
        { status: ShopTransferStatus.CANCELLED, cancelledAt: ShopContext.now(), cancelledById: actor.id },
      );
      if (!res.affected) throw new BadRequestException('Bu teklif artık onay beklemiyor.');
      this.notifyOther(other, info.shopName, 'Teklif geri çekildi', t.id, (no) => `${info.shopName}, ${no} numaralı teklifini geri çekti.`);
      return this.findOne(t.id, actor, info);
    }
    if (t.status !== ShopTransferStatus.COMPLETED) {
      throw new BadRequestException('Bu belge zaten iptal edilmiş ya da reddedilmiş.');
    }

    // Kendi başlattığı geri alma talebinden vazgeçme.
    if (t.cancelRequestedByShopId === info.shopId) {
      await this.transfersRepo.update(
        { id: t.id },
        { cancelRequestedByShopId: null, cancelRequestedById: null, cancelRequestedAt: null, cancelNote: null },
      );
      return this.findOne(t.id, actor, info);
    }
    if (t.cancelRequestedByShopId) {
      throw new BadRequestException('Karşı taraf zaten geri alma talep etmiş; onaylayın ya da reddedin.');
    }

    const otherModule = side === 'seller' ? 'purchases' : 'sales';
    if (await this.canActIn(actor, other, otherModule, 'write')) {
      await this.reverse(t, actor);
      return this.findOne(t.id, actor, info);
    }
    await this.transfersRepo.update(
      { id: t.id },
      {
        cancelRequestedByShopId: info.shopId,
        cancelRequestedById: actor.id,
        cancelRequestedAt: ShopContext.now(),
        cancelNote: note?.trim() || null,
      },
    );
    this.notifyOther(other, info.shopName, 'Geri alma talebi — onayınız bekleniyor', t.id, (no) => `${info.shopName}, ${no} numaralı belgenin geri alınmasını istiyor. İşletmeler Arası ekranından onaylayın ya da reddedin.`);
    return this.findOne(t.id, actor, info);
  }

  /** Tamamlanmış belgeyi geri alır (yetki ve karşı taraf onayı çağıranda denetlenmiştir). */
  private async reverse(transfer: ShopTransfer, actor: ShopActor): Promise<void> {
    try {
      await this.cancelInTransaction(transfer, actor);
    } catch (err) {
      // Alan dükkânda kaleme sonradan bağlanan bir kayıt (ör. aynı kaleme girilen ayrı bir alış)
      // silmeyi engellerse anlaşılır bir ileti ver; transaction geri alındığından hiçbir şey değişmez.
      if (err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23503') {
        throw new BadRequestException(
          'Malzeme alan dükkânda başka kayıtlara bağlanmış (ör. ayrı bir alış); belge geri alınamaz.',
        );
      }
      throw err;
    }
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
      const items = await manager.find(ShopTransferItem, { where: { transferId: id } });
      const plateIds = items.map((i) => i.targetPlateId).filter((v): v is string => !!v);
      const blocker = await this.cancelBlocker(manager, items, plateIds);
      if (blocker) throw new BadRequestException(blocker);

      // Satan dükkân: satış geri alınır (stok iade + cari).
      if (transfer.saleId) {
        await ShopContext.forShop(transfer.fromShopId, async () => {
          const affected = await this.salesService.reverseSale(manager, transfer.saleId!);
          for (const customerId of affected) {
            await this.accountService.recomputeBalances(manager, customerId);
          }
        });
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
          cancelledAt: ShopContext.now(),
          cancelledById: actor.id,
          cancelRequestedByShopId: null,
          cancelRequestedById: null,
          cancelRequestedAt: null,
          cancelNote: null,
        },
      );
    });
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────

  /** Belge, seçili işletmenin taraflarından birine aitse getirir (kalemleriyle); aksi hâlde 404. */
  private async loadMine(id: string, info: ShopAccessInfo): Promise<ShopTransfer> {
    const t = await this.transfersRepo.findOne({ where: { id }, relations: { items: true } });
    if (!t || (t.fromShopId !== info.shopId && t.toShopId !== info.shopId)) {
      throw new NotFoundException('Dükkânlar arası satış kaydı bulunamadı.');
    }
    return t;
  }

  /** Taraf (satıcı: satış, alıcı: satın alma) yazma yetkisi. */
  private assertSideWrite(info: ShopAccessInfo, side: 'seller' | 'buyer'): void {
    const module = side === 'seller' ? 'sales' : 'purchases';
    if (!can(info.permissions, module, 'write')) {
      throw new ForbiddenException(
        `"${info.shopName}" işletmesinde ${side === 'seller' ? 'satış' : 'satın alma'} yazma yetkiniz yok.`,
      );
    }
  }

  /** Kullanıcı verilen dükkânda bu işi yapabiliyor mu? (üye değilse ya da dükkân kapalıysa false) */
  private async canActIn(
    actor: ShopActor,
    shopId: string,
    module: 'sales' | 'purchases',
    level: 'read' | 'write',
  ): Promise<boolean> {
    try {
      const i = await this.access.resolve(actor, shopId);
      return i.shopActive && can(i.permissions, module, level);
    } catch {
      return false;
    }
  }

  /**
   * Karşı işletme işlem kabul edebilir mi (etkin, ticaret özelliği açık, beni ENGELLEMEMİŞ)?
   * Engel, işletmenin varlığıyla aynı yanıtı verir: engellendiği belli edilmez.
   */
  private async counterparty(me: string, otherId: string, approving = false): Promise<{ id: string; name: string }> {
    const rows: { id: string; name: string; is_active: boolean; status: string; features: Record<string, boolean> | null }[] =
      await this.dataSource.query(`SELECT id, name, is_active, status, features FROM shops WHERE id = $1 AND deleted_at IS NULL`, [otherId]);
    const s = rows[0];
    const usable = !!s && s.is_active && s.status === 'active' && (s.features?.trade ?? true) !== false;
    if (!usable || (await this.partners.isBlocked(otherId, me))) {
      throw new NotFoundException(
        approving ? 'Karşı işletme artık işlem kabul etmiyor.' : 'İşletme bulunamadı ya da işlem kabul etmiyor.',
      );
    }
    return { id: s.id, name: s.name };
  }

  private async shopName(id: string): Promise<string> {
    const s = await this.shopsRepo.findOne({ where: { id }, withDeleted: true });
    return s?.name ?? '—';
  }

  /** Teklif anında stok açıkça yetersizse hemen söyle (kesin denetim onayda yapılır). */
  private assertAvailable(lines: Line[]): void {
    for (const l of lines) {
      if (!l.plate.isActive) throw new BadRequestException(`"${l.plate.name}" kullanılamıyor.`);
      if (!l.area && Number(l.plate.quantityInStock) < l.quantity) {
        throw new BadRequestException(`"${l.plate.name}": stokta yeterli miktar yok.`);
      }
      if (l.area && Number(l.plate.quantityInStock) <= 0) {
        throw new BadRequestException(`"${l.plate.name}" stokta yok.`);
      }
    }
  }

  /** Karşı işletmeye (bağlamından bağımsız) bildirim olayı: Telegram/günlük bildirimi tüketici yazar. */
  private notifyOther(
    shopId: string,
    otherName: string,
    subject: string,
    transferId: string,
    body: (transferNo: string) => string,
  ): void {
    void this.transfersRepo
      .findOne({ where: { id: transferId } })
      .then((t) => this.eventEmitter.emit('shop-transfer.activity', { shopId, subject, body: body(t?.transferNo ?? ''), transferId, otherName }))
      .catch(() => undefined);
  }

  /** Satılacak kalemleri yükler, ölçü ve tutarları hesaplar. */
  private async buildLines(
    items: { plateId: string; quantity: number; unitPrice: number; widthMm?: number; heightMm?: number }[],
  ): Promise<Line[]> {
    const ids = [...new Set(items.map((i) => i.plateId))];
    const plates = await this.platesRepo.find({ where: { id: In(ids) } });
    const byId = new Map(plates.map((p) => [p.id, p]));
    return items.map((item) => {
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
      // Alan dükkân kendi stok kodunu alır (satıcınınki kopyalanmaz, sızmaz): parça başına
      // tek sorgu yerine kalemin tüm parçaları TEK sayaç güncellemesiyle.
      const skus = await allocatePlateSkus(manager, ShopContext.requireShopId(), template?.category?.code, amounts.length);
      for (const [pieceIdx, amount] of amounts.entries()) {
        const qty = line.area ? 1 : line.quantity;
        const plate = await manager.save(
          manager.create(MaterialPlate, {
            templateId,
            measurementType: src.measurementType,
            unitOfMeasure: src.unitOfMeasure,
            // Satıcının ELLE yazdığı ad taşınır; türetilmiş ad alıcının kalem alanlarından üretilir.
            customName: src.customName ?? null,
            sku: skus[pieceIdx],
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

  /** Yıllık sıralı belge numarası (DA-YYYY-NNNN). */
  private async nextNo(manager: EntityManager): Promise<string> {
    // Yerel sunucuda verilen numara merkezde boşsa korunur (bkz. docs/SYNC.md).
    const preferred = ShopContext.preferredDocNo('shop_transfers');
    if (preferred && /^DA-\d{4}-\d{4,}$/.test(preferred)) {
      const [{ n }] = await manager.query(
        `SELECT COUNT(*)::int AS n FROM shop_transfers WHERE transfer_no = $1`,
        [preferred],
      );
      if (!n) return preferred;
    }
    const prefix = `DA-${ShopContext.now().getFullYear()}-`;
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
    const me = info.shopId;

    // Alan dükkândaki sonraki durum (stok, satış, işleme) YALNIZ o dükkân da kullanıcının
    // dükkânıysa izlenir: bağımsız bir işletmenin stoğunu ve satışlarını satan göremez.
    const trackCache = new Map<string, boolean>();
    const tracks = async (toShopId: string): Promise<boolean> => {
      if (toShopId === me) return true;
      if (!trackCache.has(toShopId)) trackCache.set(toShopId, await this.canActIn(actor, toShopId, 'sales', 'read'));
      return trackCache.get(toShopId)!;
    };
    const tracked = new Set<string>();
    for (const t of transfers) if (t.status === ShopTransferStatus.COMPLETED && (await tracks(t.toShopId))) tracked.add(t.id);

    const plateIds = [
      ...new Set(
        transfers
          .filter((t) => tracked.has(t.id))
          .flatMap((t) => t.items.map((i) => i.targetPlateId).filter((v): v is string => !!v)),
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
        if (shopId === me) ok = can(info.permissions, 'sales', 'read');
        else ok = await this.canActIn(actor, shopId, 'sales', 'read');
        detailCache.set(shopId, ok);
      }
      return detailCache.get(shopId)!;
    };
    const bothCache = new Map<string, boolean>();
    const manageBoth = async (otherShopId: string, otherModule: 'sales' | 'purchases'): Promise<boolean> => {
      const key = `${otherShopId}:${otherModule}`;
      if (!bothCache.has(key)) bothCache.set(key, await this.canActIn(actor, otherShopId, otherModule, 'write'));
      return bothCache.get(key)!;
    };

    const views: ShopTransferView[] = [];
    for (const t of transfers) {
      const status = t.status;
      const live = status === ShopTransferStatus.COMPLETED;
      const trackingVisible = tracked.has(t.id);
      const detail = trackingVisible && (await detailFor(t.toShopId));
      const items = [...(t.items ?? [])]
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((it): ShopTransferItemView => {
          const base = {
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
          };
          if (status === ShopTransferStatus.PENDING) return { ...base, state: 'pending', remainingRatio: 1, usages: [] };
          if (!live) return { ...base, state: 'cancelled', remainingRatio: 0, usages: [] };
          if (!trackingVisible) return { ...base, state: 'untracked', remainingRatio: 1, usages: [] };
          const rows = (it.targetPlateId && usageByPlate.get(it.targetPlateId)) || [];
          const { state, remainingRatio } = itemState(
            it,
            it.targetPlateId ? states.get(it.targetPlateId) : undefined,
            rows.length,
            false,
          );
          return {
            ...base,
            state,
            remainingRatio,
            usages: rows.map((u) => ({
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

      const side: 'seller' | 'buyer' = t.fromShopId === me ? 'seller' : 'buyer';
      const myWrite = can(info.permissions, side === 'seller' ? 'sales' : 'purchases', 'write');
      const initiator = t.initiatorShopId ?? t.fromShopId;
      const initiatedByMe = initiator === me;
      const otherId = side === 'seller' ? t.toShopId : t.fromShopId;
      const otherModule = side === 'seller' ? 'purchases' : 'sales';
      const cancelBy = t.cancelRequestedByShopId ?? null;
      const bothSides = live && !cancelBy ? await manageBoth(otherId, otherModule) : false;
      const cancelRequest = live && cancelBy
        ? {
            byShopName: cancelBy === t.fromShopId ? t.fromShop?.name ?? '—' : t.toShop?.name ?? '—',
            byMe: cancelBy === me,
            at: t.cancelRequestedAt ?? null,
            note: t.cancelNote ?? null,
          }
        : null;
      const allInStock = items.every((i) => i.state === 'in_stock' || i.state === 'untracked');

      views.push({
        id: t.id,
        transferNo: t.transferNo,
        transferDate: t.transferDate,
        status,
        currency: t.currency,
        totalAmount: Number(t.totalAmount),
        note: t.note ?? null,
        fromShop: { id: t.fromShopId, name: t.fromShop?.name ?? '—' },
        toShop: { id: t.toShopId, name: t.toShop?.name ?? '—' },
        direction: side === 'seller' ? 'out' : 'in',
        createdBy: t.createdBy ? { id: t.createdBy.id, fullName: t.createdBy.fullName } : null,
        cancelledAt: t.cancelledAt ?? null,
        saleId: live && side === 'seller' ? t.saleId ?? null : live && trackingVisible ? t.saleId ?? null : null,
        purchaseOrderId: live && side === 'buyer' ? t.purchaseOrderId ?? null : live && trackingVisible ? t.purchaseOrderId ?? null : null,
        detailVisible: detail,
        initiatorShopId: initiator,
        initiatedByMe,
        autoApproved: !!t.autoApproved,
        decidedAt: t.decidedAt ?? null,
        decisionNote: t.decisionNote ?? null,
        canDecide: status === ShopTransferStatus.PENDING && !initiatedByMe && myWrite,
        canWithdraw: status === ShopTransferStatus.PENDING && initiatedByMe && myWrite,
        canCancel: bothSides && myWrite && allInStock,
        canRequestCancel: live && !cancelBy && !bothSides && myWrite,
        cancelRequest,
        trackingVisible,
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
