import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { User } from '../../users/entities/user.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { Customer } from './customer.entity';

/**
 * Ödeme (tahsilat).
 * İş kuralı (serviste zorunlu kılınır):
 *  - method = cash          → receivedBy (parayı teslim alan çalışan) ZORUNLU.
 *  - method = bank_transfer → bankAccount (hedef hesap) ZORUNLU.
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

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

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
