import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/** İşletmeye ait banka hesabı. Havale/EFT ödemelerinin hedefidir. */
@Entity('bank_accounts')
@Index(['shopId', 'iban'], { unique: true })
export class BankAccount extends ShopScopedEntity {
  @Column({ name: 'bank_name' })
  bankName: string;

  @Column({ name: 'account_name' })
  accountName: string;

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
