import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

/**
 * Üretim makinesi (ör. tabaka kesim, kutu harf büküm makinesi).
 * Üretim kuyruğunda işler makineye göre gruplanır → "hangi makinede ne bekliyor".
 */
@Entity('machines')
@Index(['shopId', 'code'], { unique: true })
export class Machine extends ShopScopedEntity {
  @Column()
  name: string;

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
