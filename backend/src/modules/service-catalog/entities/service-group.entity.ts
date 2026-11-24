import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/**
 * Hizmet grubu: "Harf İşleri", "Montaj", "Baskı & Uygulama" ... Stoktaki malzeme türleri gibi hizmet
 * türlerini toplar; teklifte hizmet seçerken başlık olur.
 */
@Entity('service_groups')
@Index(['shopId', 'name'], { unique: true, where: '"deleted_at" IS NULL' })
export class ServiceGroup extends ShopScopedEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
