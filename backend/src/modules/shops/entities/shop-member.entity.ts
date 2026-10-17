import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { ShopPermissions } from '../../../common/shop/shop-permissions';
import { User } from '../../users/entities/user.entity';
import { Shop } from './shop.entity';

/**
 * Bir kullanıcının bir dükkândaki yeri: yönetici mi, hangi alanı okuyup
 * hangisine yazabilir. Sistem sahibinin (OWNER) üyeliğe ihtiyacı yoktur.
 *
 * Silme fizikseldir (soft-delete değil): kullanıcı dükkândan çıkarılıp
 * yeniden eklenebilsin.
 */
@Entity('shop_members')
@Index(['shopId', 'userId'], { unique: true })
export class ShopMember extends BaseEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop?: Shop;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** Dükkân yöneticisi: bu dükkânın ekibini ve izinlerini düzenler. */
  @Column({ name: 'is_admin', default: false })
  isAdmin: boolean;

  /** Alan başına { read, write }. Bkz. common/shop/shop-permissions.ts */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  permissions: ShopPermissions;
}
