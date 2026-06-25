import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { ProcessingRate } from './processing-rate.entity';

/**
 * İşleme Kaydı.
 * Ürünün NE ZAMAN işlendiği (processed_at) zaman damgasıyla tutulur.
 * Maliyet METREKARE bazında hesaplanır: total = area_m2 × rate_per_m2 + extra.
 * rate_per_m2, kullanılan şablondan veya işlem anında girilen dinamik değerden
 * gelir (etkin değer burada saklanır → geçmişe dönük doğru kalır).
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

  @ManyToOne(() => ProcessingRate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rate_preset_id' })
  ratePreset?: ProcessingRate;

  @Column({ name: 'rate_preset_id', nullable: true })
  ratePresetId?: string;

  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 1 })
  quantity: number;

  @Column({ name: 'width_mm', type: 'numeric', precision: 10, scale: 2 })
  widthMm: number;

  @Column({ name: 'height_mm', type: 'numeric', precision: 10, scale: 2 })
  heightMm: number;

  @Column({ name: 'area_m2', type: 'numeric', precision: 14, scale: 4 })
  areaM2: number;

  /** İşlemde kullanılan ETKİN m² fiyatı (şablon ya da dinamik override). */
  @Column({ name: 'rate_per_m2', type: 'numeric', precision: 14, scale: 2 })
  ratePerM2: number;

  @Column({ name: 'labor_cost', type: 'numeric', precision: 14, scale: 2 })
  laborCost: number;

  @Column({
    name: 'extra_cost',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  extraCost: number;

  @Column({ name: 'total_cost', type: 'numeric', precision: 14, scale: 2 })
  totalCost: number;

  /** Müşteri cari hesabına borç olarak yansıtıldı mı. */
  @Column({ name: 'is_billed', default: false })
  isBilled: boolean;

  @Column({ type: 'text', nullable: true })
  note?: string;
}
