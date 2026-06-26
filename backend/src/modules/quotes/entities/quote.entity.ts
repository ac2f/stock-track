import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';
import { Customer } from '../../customers/entities/customer.entity';
import { QuoteItem } from './quote-item.entity';

/**
 * Teklif (proforma). Müşteriye verilen fiyat tahmini; cari/stok hareketi YOK.
 * ACCEPTED olduğunda `convert` ile gerçek Satış ve/veya İşleme kaydına dönüşür.
 * Karışık olabilir: aynı teklifte hem satış hem işleme kalemleri.
 */
@Entity('quotes')
@Index(['buyerCustomerId'])
@Index(['status'])
export class Quote extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'quote_no' })
  quoteNo: string; // ör. TKF-2026-0001

  @ManyToOne(() => Customer, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_customer_id' })
  buyerCustomer: Customer;

  @Column({ name: 'buyer_customer_id' })
  buyerCustomerId: string;

  // Satılan malzeme üçüncü kişiye aitse sahibi (konsinye satışları için).
  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_customer_id' })
  ownerCustomer?: Customer;

  @Column({ name: 'owner_customer_id', type: 'uuid', nullable: true })
  ownerCustomerId?: string | null;

  // Dönüşümde satışın stok düşeceği depo (opsiyonel).
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId?: string | null;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil?: Date | null;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({
    name: 'exchange_rate',
    type: 'numeric',
    precision: 18,
    scale: 6,
    default: 1,
  })
  exchangeRate: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total: number;

  @Column({
    name: 'base_total',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  baseTotal: number;

  @Column({ name: 'converted_sale_id', type: 'uuid', nullable: true })
  convertedSaleId?: string | null;

  @Column({ name: 'converted_at', type: 'timestamptz', nullable: true })
  convertedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @OneToMany(() => QuoteItem, (item) => item.quote, {
    cascade: true,
    eager: true,
  })
  items: QuoteItem[];
}
