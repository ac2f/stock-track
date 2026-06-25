import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CustomerLedgerEntry } from './customer-ledger-entry.entity';
import { Payment } from './payment.entity';

/**
 * Müşteri (Cari).
 * current_balance, defterle (ledger) tutarlı tutulan ANLIK borç bakiyesidir
 * (cache). Kaynağı: opening_balance + Σ DEBIT − Σ CREDIT.
 */
@Entity('customers')
export class Customer extends BaseEntity {
  @Index()
  @Column()
  name: string;

  @Column({ name: 'company_name', nullable: true })
  companyName?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ name: 'tax_number', nullable: true })
  taxNumber?: string;

  @Column({
    name: 'opening_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  openingBalance: number;

  /** Anlık borç (pozitif = müşteri borçlu). */
  @Column({
    name: 'current_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  currentBalance: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => CustomerLedgerEntry, (entry) => entry.customer)
  ledgerEntries?: CustomerLedgerEntry[];

  @OneToMany(() => Payment, (payment) => payment.customer)
  payments?: Payment[];
}
