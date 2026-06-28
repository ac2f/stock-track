import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Kategoriye özel marka kataloğu (örn. Pleksi → "Plexiglas", "Setacryl").
 * Bir markanın diğer kategorilerde (örn. Kompozit) seçilmesini önlemek için
 * `categoryId` zorunludur — şablon/plaka oluştururken kategori eşleşmesi doğrulanır.
 */
@Entity('material_brands')
export class MaterialBrand extends BaseEntity {
  @Column()
  name: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
