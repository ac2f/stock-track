import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Metrekare Birim Fiyat Şablonu.
 * İşleme maliyetinin m² fiyatı burada ön ayarlı (sabit) tutulur. İşlem anında
 * kullanıcı bu değeri dinamik olarak ezebilir (bkz. ProcessingJob.ratePerM2).
 */
@Entity('processing_rates')
export class ProcessingRate extends BaseEntity {
  @Column()
  name: string; // "Standart Kesim", "UV Baskı", "Lazer"

  @Column({ name: 'rate_per_m2', type: 'numeric', precision: 14, scale: 2 })
  ratePerM2: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
