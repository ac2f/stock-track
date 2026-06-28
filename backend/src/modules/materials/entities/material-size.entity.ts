import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** Kategoriye özel standart ebat kataloğu (en × boy, mm). */
@Entity('material_sizes')
export class MaterialSize extends BaseEntity {
  @Column({ name: 'width_mm', type: 'numeric', precision: 10, scale: 2 })
  widthMm: number;

  @Column({ name: 'height_mm', type: 'numeric', precision: 10, scale: 2 })
  heightMm: number;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
