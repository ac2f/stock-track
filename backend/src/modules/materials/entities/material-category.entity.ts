import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

/**
 * Malzeme türü (kategori). Sabit bir enum DEĞİL — İşletme Sahibi kendi
 * işletmesine özgü türleri ekleyebilir/düzenleyebilir/silebilir.
 */
@Entity('material_categories')
@Index(['shopId', 'code'], { unique: true })
export class MaterialCategoryEntity extends ShopScopedEntity {
  @Column()
  name: string; // "Alüminyum"

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
