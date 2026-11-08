import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { ShopTransferItem } from './shop-transfer-item.entity';

export enum ShopTransferStatus {
  /** Karşı tarafın onayını bekliyor: henüz stok/cari/alış kaydı YOK. */
  PENDING = 'pending',
  COMPLETED = 'completed',
  /** Karşı taraf reddetti. */
  REJECTED = 'rejected',
  /** Bekleyen teklif geri çekildi ya da tamamlanmış belge geri alındı. */
  CANCELLED = 'cancelled',
}

/**
 * Dükkânlar arası satış: bir dükkân (satan) stoğundaki malzemeyi başka bir
 * dükkâna (alan) satar.
 *
 * İki dükkânın da kendi kaydı oluşur ve ikisi de bu belgeye bağlanır:
 *  - satan dükkânda alan dükkânı temsil eden cariye normal bir SATIŞ
 *    (stok düşer, cari borçlanır),
 *  - alan dükkânda satan dükkânı temsil eden tedarikçiden bir ALIŞ
 *    (malzeme yeni stok kalemi olarak girer, alış fiyatı maliyeti olur).
 *
 * İki dükkâna birden ait olduğundan dükkân süzgecine bağlı DEĞİLDİR; erişimi
 * servis denetler (kayıt yalnız iki taraftaki dükkândan görülür).
 *
 * Onay akışı: belgeyi bir taraf başlatır (satıcı "satış teklifi" ya da alıcı "alım
 * talebi"); KARŞI taraf onaylayana kadar belge `pending` kalır ve hiçbir stok/cari
 * kaydı yazılmaz. Onayla birlikte iki taraftaki kayıtlar tek işlemde yazılır. İki
 * tarafı da yönetebilen kişide (kendi şubeleri) ya da karşı tarafın "otomatik onayla"
 * yetkisi varsa belge doğrudan tamamlanır. Tamamlanmış belgenin geri alınması da
 * karşı tarafın onayıyla olur (iki tarafı yönetebilen hariç).
 */
@Entity('shop_transfers')
@Index(['fromShopId', 'transferDate'])
@Index(['toShopId', 'transferDate'])
export class ShopTransfer extends BaseEntity {
  /** Belge numarası (DA-2026-0001), bütün dükkânlarda tek sıra. */
  @Index({ unique: true })
  @Column({ name: 'transfer_no' })
  transferNo: string;

  @Column({ name: 'from_shop_id', type: 'uuid' })
  fromShopId: string;

  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'from_shop_id' })
  fromShop?: Shop;

  @Column({ name: 'to_shop_id', type: 'uuid' })
  toShopId: string;

  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'to_shop_id' })
  toShop?: Shop;

  @Column({ name: 'transfer_date', type: 'timestamptz' })
  transferDate: Date;

  @Column({
    type: 'enum',
    enum: ShopTransferStatus,
    default: ShopTransferStatus.COMPLETED,
  })
  status: ShopTransferStatus;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Satan dükkândaki satış kaydı. */
  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId?: string | null;

  /** Satan dükkânda alan dükkânı temsil eden cari. */
  @Column({ name: 'buyer_customer_id', type: 'uuid', nullable: true })
  buyerCustomerId?: string | null;

  /** Alan dükkândaki alış kaydı. */
  @Column({ name: 'purchase_order_id', type: 'uuid', nullable: true })
  purchaseOrderId?: string | null;

  /** Alan dükkânda satan dükkânı temsil eden tedarikçi. */
  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId?: string | null;

  /** Belgeyi başlatan dükkân (onaylayan karşı taraftır). Eski kayıtlarda boş = satan. */
  @Column({ name: 'initiator_shop_id', type: 'uuid', nullable: true })
  initiatorShopId?: string | null;

  /** Satan dükkândaki çıkış deposu (verilmişse). */
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId?: string | null;

  /** Kararı veren kişi (onay/ret); otomatik onayda yetkiyi tanıyan kişi. */
  @Column({ name: 'decided_by_id', type: 'uuid', nullable: true })
  decidedById?: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ name: 'decision_note', type: 'varchar', length: 300, nullable: true })
  decisionNote?: string | null;

  /** Karşı tarafın "otomatik onayla" yetkisi ya da iki tarafın aynı kişide olmasıyla onaysız tamamlandı. */
  @Column({ name: 'auto_approved', default: false })
  autoApproved: boolean;

  /** Tamamlanmış belgenin geri alınmasını isteyen dükkân (karşı taraf onaylayana kadar). */
  @Column({ name: 'cancel_requested_by_shop_id', type: 'uuid', nullable: true })
  cancelRequestedByShopId?: string | null;

  @Column({ name: 'cancel_requested_by_id', type: 'uuid', nullable: true })
  cancelRequestedById?: string | null;

  @Column({ name: 'cancel_requested_at', type: 'timestamptz', nullable: true })
  cancelRequestedAt?: Date | null;

  @Column({ name: 'cancel_note', type: 'varchar', length: 300, nullable: true })
  cancelNote?: string | null;

  /** Belgeyi başlatan kişi (teklif/talep sahibi). */
  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt?: Date | null;

  @Column({ name: 'cancelled_by_id', type: 'uuid', nullable: true })
  cancelledById?: string | null;

  @OneToMany(() => ShopTransferItem, (item) => item.transfer, { cascade: true })
  items: ShopTransferItem[];
}
