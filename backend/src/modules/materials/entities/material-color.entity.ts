import { Column, Entity } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/**
 * Kategoriye özel renk kataloğu. İsim + kod birlikte tek kayıtta tutulur,
 * böylece bir renk seçildiğinde kod (varsa) otomatik gelir — ayrı bir
 * "koddan isme" eşleme mantığına gerek kalmaz.
 *
 * Aynı adda birden çok kod olabilir (Beyaz 1001, Beyaz 2002) ve renk bir
 * markaya bağlanabilir (renk kodları markaya özeldir). Kimlik: kategori +
 * marka + ad + kod; marka boşsa renk bütün markalarda seçilebilir.
 */
@Entity('material_colors')
export class MaterialColor extends ShopScopedEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  code?: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  /** Rengin ait olduğu marka (kod o markanın kataloğundan); boşsa genel. */
  @Column({ name: 'brand_id', type: 'uuid', nullable: true })
  brandId?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
