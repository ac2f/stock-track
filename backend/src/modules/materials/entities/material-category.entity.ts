import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

/**
 * Malzeme türü (kategori). Sabit bir enum DEĞİL — İşletme Sahibi kendi
 * işletmesine özgü türleri ekleyebilir/düzenleyebilir/silebilir.
 */
@Entity('material_categories')
export class MaterialCategoryEntity extends BaseEntity {
  @Column()
  name: string; // "Alüminyum"

  @Index({ unique: true })
  @Column()
  code: string; // slug, ör. "aluminum"

  @Column({
    name: 'default_measurement_type',
    type: 'enum',
    enum: MeasurementType,
    default: MeasurementType.AREA,
  })
  defaultMeasurementType: MeasurementType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
