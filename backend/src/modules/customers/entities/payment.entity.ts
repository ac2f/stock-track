import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { PaymentDirection } from '../../../common/enums/payment-direction.enum';
import { User } from '../../users/entities/user.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { Customer } from './customer.entity';

/**
 * Ödeme (tahsilat/ödeme).
 * İş kuralı (serviste zorunlu kılınır):
 *  - method = cash          → receivedBy (parayı teslim alan/veren çalışan) ZORUNLU.
 *  - method = bank_transfer → bankAccount (hesap) ZORUNLU.
 * Yön:
 *  - INCOMING → müşteriden tahsilat (borç azalır).
 *  - OUTGOING → malzeme sahibine ödeme (alacağı azalır).
 */
@Entity('payments')
export class Payment extends BaseEntity {
  @ManyToOne(() => Customer, (customer) => customer.payments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({
    type: 'enum',
    enum: PaymentDirection,
    default: PaymentDirection.INCOMING,
  })
  direction: PaymentDirection;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  // Para birimi (yabancı para ise baz tutara çevrilir).
  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 6, default: 1 })
  exchangeRate: number;

  @Column({ name: 'base_amount', type: 'numeric', precision: 14, scale: 2 })
  baseAmount: number;

  @Column({ name: 'payment_date', type: 'timestamptz' })
  paymentDate: Date;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  // Nakit tahsilatta parayı teslim alan çalışan.
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'received_by_id' })
  receivedBy?: User;

  @Column({ name: 'received_by_id', nullable: true })
  receivedById?: string;

  // Havale/EFT'te paranın yatırıldığı banka hesabı.
  @ManyToOne(() => BankAccount, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount?: BankAccount;

  @Column({ name: 'bank_account_id', nullable: true })
  bankAccountId?: string;

  @Column({ name: 'reference_no', nullable: true })
  referenceNo?: string;

  /** Ödeme sonrası kalan borç (anlık görüntü). */
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  balanceAfter: number;

  @Column({ nullable: true })
  note?: string;
}
