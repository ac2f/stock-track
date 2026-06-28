import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ExpenseCategory } from './expense-category.entity';
import { Project } from './project.entity';

/**
 * Gider kaydı. Bir gider türüne (zorunlu) ve opsiyonel bir işe/projeye bağlanır.
 * `expenseDate` ile dönem raporları çıkarılır.
 */
@Entity('expenses')
@Index(['expenseDate'])
export class Expense extends BaseEntity {
  @ManyToOne(() => ExpenseCategory, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: ExpenseCategory;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => Project, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: Project | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId?: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'expense_date', type: 'date' })
  expenseDate: string;

  @Column({ type: 'text', nullable: true })
  description?: string;
}
