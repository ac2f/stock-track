import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { PriceRule } from './price-rule.entity';

/**
 * Bir malzemecinin (tedarikçi) fiyat çatısındaki fiyatı. Malzemeci boşsa
 * işletmenin kendi liste fiyatıdır. Birim çatınınkidir; para birimi TRY ya da
 * döviz olabilir, hesapta son kurla baz para birimine çevrilir.
 */
@Entity('price_rule_entries')
@Index(['ruleId'])
export class PriceRuleEntry extends ShopScopedEntity {
  @ManyToOne(() => PriceRule, (rule) => rule.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: PriceRule;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => Supplier, { eager: true, nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier | null;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId?: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  price: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  /** Fiyatın en son güncellendiği an. */
  @Column({ name: 'price_updated_at', type: 'timestamptz' })
  priceUpdatedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;
}
