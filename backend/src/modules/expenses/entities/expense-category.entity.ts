import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Gider türü (kira, elektrik, market, personel, iş-malzeme vb.).
 * İşletme Sahibi serbestçe ekler/düzenler/siler. `isRecurring` sürekli/sabit
 * giderleri (kira, aidat, elektrik) işaretler — tutarları zamanla güncellenebilir.
 */
@Entity('expense_categories')
export class ExpenseCategory extends BaseEntity {
  @Index({ unique: true })
  @Column()
  name: string;

  @Column({ name: 'is_recurring', default: false })
  isRecurring: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
