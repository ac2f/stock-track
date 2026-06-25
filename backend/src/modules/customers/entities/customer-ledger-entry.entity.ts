import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { Customer } from './customer.entity';

/**
 * Cari Defteri Hareketi.
 * Borcun nasıl biriktiğinin tam geçmişidir. Her hareket, o andaki kalan borcu
 * (balance_after) anlık görüntü olarak taşır → geçmişe dönük izlenebilirlik.
 */
@Entity('customer_ledger_entries')
@Index(['customerId', 'occurredAt'])
export class CustomerLedgerEntry extends BaseEntity {
  @ManyToOne(() => Customer, (customer) => customer.ledgerEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'entry_type', type: 'enum', enum: LedgerEntryType })
  entryType: LedgerEntryType;

  @Column({ name: 'source_type', type: 'enum', enum: LedgerSourceType })
  sourceType: LedgerSourceType;

  /** Hareketi doğuran kaydın id'si (ör. payment.id, processing_job.id). */
  @Column({ name: 'source_id', nullable: true })
  sourceId?: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  /** Bu hareketten sonra kalan borç. */
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  balanceAfter: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
