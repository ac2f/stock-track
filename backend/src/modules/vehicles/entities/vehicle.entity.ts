import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/** Satın alma sırasında kullanılan araç. */
@Entity('vehicles')
@Index(['shopId', 'plateNumber'], { unique: true })
export class Vehicle extends ShopScopedEntity {
  @Column({ name: 'plate_number' })
  plateNumber: string;

  @Column()
  name: string; // "Beyaz Panelvan" vb.

  @Column({ nullable: true })
  type?: string; // Kamyonet / Panelvan / Kamyon

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
