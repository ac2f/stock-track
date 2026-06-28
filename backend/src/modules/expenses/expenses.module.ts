import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { Project } from './entities/project.entity';
import { Expense } from './entities/expense.entity';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

/**
 * Gider yönetimi: düzenlenebilir gider türleri, iş/proje kayıtları ve giderler
 * (tarih/tür/iş bazlı sorgu + özet). Yalnızca İşletme Sahibi erişir.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ExpenseCategory, Project, Expense])],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
