import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

/**
 * İşleme Birim Fiyat Şablonu.
 * İşleme maliyetinin birim fiyatı burada ön ayarlı (sabit) tutulur. Birim,
 * makineye göre değişir: AREA (m², tabaka kesimi), LENGTH (metre, kutu harf),
 * PIECE (adet). İşlem anında kullanıcı bu değeri dinamik ezebilir.
 */
@Entity('processing_rates')
export class ProcessingRate extends BaseEntity {
  @Column()
  name: string; // "Standart Kesim", "Kutu Harf — metre", "Lazer"

  /** Bu tarifenin geçerli olduğu birim (m² / metre / adet). */
  @Column({
    type: 'enum',
    enum: MeasurementType,
    default: MeasurementType.AREA,
  })
  unit: MeasurementType;

  @Column({ name: 'rate_per_unit', type: 'numeric', precision: 14, scale: 2 })
  ratePerUnit: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
