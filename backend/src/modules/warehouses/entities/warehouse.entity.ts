import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/** Depo / lokasyon. Stok seviyeleri depo bazında tutulur. */
@Entity('warehouses')
@Index(['shopId', 'code'], { unique: true })
export class Warehouse extends ShopScopedEntity {
  @Column()
  name: string;

  @Column()
  code: string; // ör. "MERKEZ", "SUBE-1"

  @Column({ nullable: true })
  address?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
