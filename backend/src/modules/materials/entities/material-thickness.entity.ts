import { Column, Entity } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/** Kategoriye özel standart kalınlık kataloğu (mm). */
@Entity('material_thicknesses')
export class MaterialThickness extends ShopScopedEntity {
  @Column({ name: 'value_mm', type: 'numeric', precision: 8, scale: 2 })
  valueMm: number;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
