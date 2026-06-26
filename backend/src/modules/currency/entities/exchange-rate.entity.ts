import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Döviz kuru.
 * `rate` = 1 birim `quoteCurrency` kaç birim `baseCurrency` eder.
 * Örn. base=TRY, quote=USD, rate=32.5  →  1 USD = 32.5 TRY.
 */
@Entity('exchange_rates')
@Index(['baseCurrency', 'quoteCurrency', 'asOf'])
export class ExchangeRate extends BaseEntity {
  @Column({ name: 'base_currency', length: 3 })
  baseCurrency: string;

  @Column({ name: 'quote_currency', length: 3 })
  quoteCurrency: string;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  rate: number;

  @Column({ name: 'as_of', type: 'timestamptz' })
  asOf: Date;

  @Column({ default: 'manual' })
  source: string; // 'manual' | 'api'
}
