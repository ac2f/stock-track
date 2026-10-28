import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
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
@Index(['shopId', 'quoteNo'], { unique: true })
// Teklif listesi tarihe göre (varsayılan: son 1 hafta).
@Index(['shopId', 'createdAt'])
export class Quote extends ShopScopedEntity {
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

  /**
   * Teklifin tarihi. Geriye dönük girişte (eski bir iş sisteme sonradan
   * işlenirken) gerçek tarih buraya yazılır; boşsa kayıt tarihi (createdAt)
   * geçerlidir. Liste, süzgeç, yazdırma ve dönüşümde oluşan satış/iş tarihleri
   * bunu kullanır.
   */
  @Column({ name: 'quote_date', type: 'timestamptz', nullable: true })
  quoteDate?: Date | null;

  /**
   * true → dükkân bilgisayarındaki runner bu teklif için KENDİLİĞİNDEN klasör
   * açmaz (geriye dönük kayıt: "bugün" için klasör oluşmasın). Klasör yine de
   * elle istenebilir (request-folders).
   */
  @Column({ name: 'skip_folders', default: false })
  skipFolders: boolean;

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

  /**
   * Dükkân bilgisayarındaki runner bu teklifin klasörlerini açtığını
   * bildirdiği an, açtığı müşteri klasörü ve bilgisayarın adı.
   */
  @Column({ name: 'folders_created_at', type: 'timestamptz', nullable: true })
  foldersCreatedAt?: Date | null;

  @Column({ name: 'folders_path', type: 'varchar', length: 500, nullable: true })
  foldersPath?: string | null;

  @Column({ name: 'folders_host', type: 'varchar', length: 120, nullable: true })
  foldersHost?: string | null;

  /** Runner'ın notu (ör. yeniden adlandırılamayan klasör). */
  @Column({ name: 'folders_note', type: 'text', nullable: true })
  foldersNote?: string | null;

  /**
   * Klasörlerin yeniden istendiği an (runner kapalıyken dönüşen ya da
   * klasörü silinen teklif için). Runner bundan sonra açınca düşer.
   */
  @Column({ name: 'folders_requested_at', type: 'timestamptz', nullable: true })
  foldersRequestedAt?: Date | null;

  @OneToMany(() => QuoteItem, (item) => item.quote, {
    cascade: true,
    eager: true,
  })
  items: QuoteItem[];
}
