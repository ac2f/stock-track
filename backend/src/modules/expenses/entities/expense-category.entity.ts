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

  // Sürekli giderin aylık tutarı (kira vb.) — güncellenebilir.
  @Column({
    name: 'recurring_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  recurringAmount?: number | null;

  // Ayın hangi günü ödendiği/vadesi (1-31). Bekleyen hesaplaması için.
  @Column({ name: 'recurring_day_of_month', type: 'int', nullable: true })
  recurringDayOfMonth?: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
