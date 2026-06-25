import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** İşletmeye ait banka hesabı. Havale/EFT ödemelerinin hedefidir. */
@Entity('bank_accounts')
export class BankAccount extends BaseEntity {
  @Column({ name: 'bank_name' })
  bankName: string;

  @Column({ name: 'account_name' })
  accountName: string;

  @Index({ unique: true })
  @Column()
  iban: string;

  @Column({ name: 'account_number', nullable: true })
  accountNumber?: string;

  @Column({ nullable: true })
  branch?: string;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
