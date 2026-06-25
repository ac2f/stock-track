import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { User } from '../../users/entities/user.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';

/**
 * Satın Alma.
 * - Tedarikçi (kimden alındı)
 * - Satın almayı yapan personel
 * - Kullanılan araç
 * kayıt altına alınır. Kalemler stoğa giriş yapar.
 */
@Entity('purchase_orders')
export class PurchaseOrder extends BaseEntity {
  @ManyToOne(() => Supplier, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'supplier_id' })
  supplierId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'purchased_by_id' })
  purchasedBy: User;

  @Column({ name: 'purchased_by_id' })
  purchasedById: string;

  @ManyToOne(() => Vehicle, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: Vehicle;

  @Column({ name: 'vehicle_id', nullable: true })
  vehicleId?: string;

  @Column({ name: 'purchase_date', type: 'timestamptz' })
  purchaseDate: Date;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalAmount: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, {
    cascade: true,
    eager: true,
  })
  items: PurchaseOrderItem[];
}
