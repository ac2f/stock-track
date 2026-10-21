import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { ShopTransferItem } from './shop-transfer-item.entity';

export enum ShopTransferStatus {
  COMPLETED = 'completed',
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
