import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../customers/entities/payment.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { BankReconciliationController } from './controllers/bank-reconciliation.controller';
import { BankReconciliationService } from './services/bank-reconciliation.service';

/**
 * Banka mutabakatı: banka hareketlerini tahsilat/ödeme ve giderlerle eşleştirir.
 *
 * Veri kaynağı soyutlanmıştır — bugün ekstre dosyası, yarın banka API'si.
 * Payment ve Expense yalnızca OKUMA amaçlı kaydedilir; mutabakat bu kayıtları
 * değiştirmez, sadece hangi banka hareketine karşılık geldiklerini işaretler.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BankTransaction, Payment, Expense])],
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}
