import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

/**
 * Üretim makinesi (ör. tabaka kesim, kutu harf büküm makinesi).
 * Üretim kuyruğunda işler makineye göre gruplanır → "hangi makinede ne bekliyor".
 */
@Entity('machines')
export class Machine extends BaseEntity {
  @Column()
  name: string;

  @Index({ unique: true })
  @Column()
  code: string; // ör. "KESIM", "KUTU-HARF"

  /** Bu makinenin tipik faturalama birimi (m² / metre / adet). */
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
