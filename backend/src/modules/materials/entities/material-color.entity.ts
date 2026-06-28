import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Kategoriye özel renk kataloğu. İsim + kod birlikte tek kayıtta tutulur,
 * böylece bir renk seçildiğinde kod (varsa) otomatik gelir — ayrı bir
 * "koddan isme" eşleme mantığına gerek kalmaz.
 */
@Entity('material_colors')
export class MaterialColor extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  code?: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
