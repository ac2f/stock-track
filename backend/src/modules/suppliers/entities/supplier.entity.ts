import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/** Tedarikçi (malzemeci). Satın alma ve piyasa fiyatlarıyla ilişkilidir. */
@Entity('suppliers')
export class Supplier extends ShopScopedEntity {
  @Column()
  name: string;

  @Column({ name: 'contact_name', nullable: true })
  contactName?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ name: 'tax_number', nullable: true })
  taxNumber?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * Bu tedarikçi başka bir DÜKKÂNI temsil eder (dükkânlar arası alışta
   * satıcı). Kendiliğinden açılır.
   */
  @Index()
  @Column({ name: 'linked_shop_id', type: 'uuid', nullable: true })
  linkedShopId?: string | null;
}
