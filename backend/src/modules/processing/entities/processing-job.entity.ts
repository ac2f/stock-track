import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { ProcessingStatus } from '../../../common/enums/processing-status.enum';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { Machine } from './machine.entity';
import { ProcessingRate } from './processing-rate.entity';

/**
 * İşleme Kaydı.
 * Ne zaman işlendiği (processed_at) zaman damgasıyla tutulur. Maliyet birime
 * göre hesaplanır: total = quantity_value × rate_per_unit + extra.
 *  - AREA  → quantity_value = m² (en×boy×adet)
 *  - LENGTH→ quantity_value = metre (uzunluk×adet)   [kutu harf makineleri]
 *  - PIECE → quantity_value = adet
 * rate_per_unit, şablondan ya da işlem anındaki dinamik değerden gelir (etkin
 * değer saklanır → geçmişe dönük doğru). Yabancı para işlemde baz tutar tutulur.
 */
@Entity('processing_jobs')
@Index(['customerId', 'processedAt'])
export class ProcessingJob extends BaseEntity {
  @ManyToOne(() => MaterialPlate, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plate_id' })
  plate: MaterialPlate;

  @Column({ name: 'plate_id' })
  plateId: string;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ name: 'customer_id', nullable: true })
  customerId?: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'processed_by_id' })
  processedBy: User;

  @Column({ name: 'processed_by_id' })
  processedById: string;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse?: Warehouse;

  @Column({ name: 'warehouse_id', nullable: true })
  warehouseId?: string;

  @ManyToOne(() => ProcessingRate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rate_preset_id' })
  ratePreset?: ProcessingRate;

  @Column({ name: 'rate_preset_id', nullable: true })
  ratePresetId?: string;

  // ── Üretim kuyruğu ──
  @ManyToOne(() => Machine, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'machine_id' })
  machine?: Machine;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId?: string | null;

  /** Üretim/atölye durumu (kuyruk). */
  @Column({
    type: 'enum',
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING,
  })
  status: ProcessingStatus;

  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 1 })
  quantity: number;

  // Tabaka (AREA) için ölçüler; diğer birimlerde opsiyonel.
  @Column({ name: 'width_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  widthMm?: number | null;

  @Column({ name: 'height_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  heightMm?: number | null;

  // LENGTH birimi için işlenen uzunluk (metre/adet bazında girilen).
  @Column({ name: 'length_m', type: 'numeric', precision: 12, scale: 4, nullable: true })
  lengthM?: number | null;

  /** Faturalama birimi (m² / metre / adet). */
  @Column({ name: 'billing_unit', type: 'enum', enum: MeasurementType })
  billingUnit: MeasurementType;

  /** Faturalanan ölçü miktarı (m² / metre / adet — billingUnit'e göre). */
  @Column({ name: 'quantity_value', type: 'numeric', precision: 14, scale: 4 })
  quantityValue: number;

  /** Etkin birim fiyatı (şablon veya dinamik override). */
  @Column({ name: 'rate_per_unit', type: 'numeric', precision: 14, scale: 2 })
  ratePerUnit: number;

  @Column({ name: 'labor_cost', type: 'numeric', precision: 14, scale: 2 })
  laborCost: number;

  @Column({ name: 'extra_cost', type: 'numeric', precision: 14, scale: 2, default: 0 })
  extraCost: number;

  @Column({ name: 'total_cost', type: 'numeric', precision: 14, scale: 2 })
  totalCost: number;

  // ── Para birimi (yabancı para işlemlerde baz tutar saklanır) ──
  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 6, default: 1 })
  exchangeRate: number;

  @Column({ name: 'base_total_cost', type: 'numeric', precision: 14, scale: 2 })
  baseTotalCost: number;

  /** Müşteri cari hesabına borç olarak yansıtıldı mı. */
  @Column({ name: 'is_billed', default: false })
  isBilled: boolean;

  /**
   * Faturalama tamamlanmaya ertelendi mi (PENDING iş). true ise iş COMPLETED'a
   * geçtiğinde cariye borç (DEBIT) yazılır; false ise oluştururken yazıldı/yazılmaz.
   */
  @Column({ name: 'bill_on_completion', default: false })
  billOnCompletion: boolean;

  /** Stok bu iş için düşüldü mü (tamamlama/iptalde mükerrerliği önler). */
  @Column({ name: 'stock_consumed', default: false })
  stockConsumed: boolean;

  /** Bu iş için fiilen düşülen miktar (iptalde tam bu kadar iade edilir). */
  @Column({ name: 'consumed_quantity', type: 'numeric', precision: 12, scale: 2, default: 0 })
  consumedQuantity: number;

  /**
   * Tabaka (AREA) işinde stoktan düşülen kalan boy (mm). İptalde bu kadar boy
   * tabakaya geri eklenir. AREA dışı işlerde null.
   */
  @Column({ name: 'consumed_height_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  consumedHeightMm?: number | null;

  /**
   * Tabaka (AREA) işinde stoktan düşülen kalan EN (mm) — enlemesine (dikey şerit)
   * kesimde kullanılır. İptalde bu kadar en tabakaya geri eklenir. Yoksa null.
   */
  @Column({ name: 'consumed_width_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  consumedWidthMm?: number | null;

  /** Bu iş bir teklif dönüşümünden geldiyse kaynak teklif (kuyruktan teklife gitmek için). */
  @Column({ name: 'quote_id', type: 'uuid', nullable: true })
  quoteId?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string;
}
