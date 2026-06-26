import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { SaleItem } from './sale-item.entity';

/**
 * Satış.
 * - buyerCustomer  → alıcı (cari borçlanır).
 * - ownerCustomer? → satılan malzemenin sahibi (üçüncü kişi). Varsa pay alacaklanır.
 * İşletme kârı = satış toplamı − sahip payı.
 */
@Entity('sales')
@Index(['buyerCustomerId', 'saleDate'])
export class Sale extends BaseEntity {
  @ManyToOne(() => Customer, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_customer_id' })
  buyerCustomer: Customer;

  @Column({ name: 'buyer_customer_id' })
  buyerCustomerId: string;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_customer_id' })
  ownerCustomer?: Customer;

  @Column({ name: 'owner_customer_id', nullable: true })
  ownerCustomerId?: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sold_by_id' })
  soldBy: User;

  @Column({ name: 'sold_by_id' })
  soldById: string;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse?: Warehouse;

  @Column({ name: 'warehouse_id', nullable: true })
  warehouseId?: string;

  @Column({ name: 'sale_date', type: 'timestamptz' })
  saleDate: Date;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 6, default: 1 })
  exchangeRate: number;

  /** Satış toplamı (işlem para biriminde). */
  @Column({ name: 'sale_total', type: 'numeric', precision: 14, scale: 2 })
  saleTotal: number;

  /** Sahibe yansıyan toplam pay (işlem para biriminde). */
  @Column({ name: 'owner_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  ownerAmount: number;

  /** İşletme kârı = saleTotal − ownerAmount (işlem para biriminde). */
  @Column({ name: 'business_margin', type: 'numeric', precision: 14, scale: 2, default: 0 })
  businessMargin: number;

  // Baz para biriminde karşılıklar (cari/rapor için).
  @Column({ name: 'base_sale_total', type: 'numeric', precision: 14, scale: 2 })
  baseSaleTotal: number;

  @Column({ name: 'base_owner_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  baseOwnerAmount: number;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true, eager: true })
  items: SaleItem[];
}
