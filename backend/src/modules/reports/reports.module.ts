import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerLedgerEntry } from '../customers/entities/customer-ledger-entry.entity';
import { Payment } from '../customers/entities/payment.entity';
import { ProcessingJob } from '../processing/entities/processing-job.entity';
import { PurchaseOrder } from '../purchases/entities/purchase-order.entity';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { StockLevel } from '../materials/entities/stock-level.entity';
import { Sale } from '../sales/entities/sale.entity';
import { ExpensesModule } from '../expenses/expenses.module';
import { ReportsController } from './reports.controller';
import { DashboardService } from './services/dashboard.service';
import { FinancialReportsService } from './services/financial-reports.service';
import { InventoryReportsService } from './services/inventory-reports.service';

/**
 * Mali raporlama — yeni entity yok; mevcut tablolar salt-okunur toplulaştırılır.
 * Entity'leri forFeature ile kaydetmek repository injection için yeterlidir.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerLedgerEntry,
      Payment,
      ProcessingJob,
      PurchaseOrder,
      MaterialPlate,
      StockLevel,
      Sale,
    ]),
    ExpensesModule, // mali borca bekleyen sürekli giderleri katmak için
  ],
  controllers: [ReportsController],
  providers: [
    DashboardService,
    FinancialReportsService,
    InventoryReportsService,
  ],
  // Documents modülü, Excel/CSV dışa aktarımda rapor servislerini kullanır.
  exports: [
    DashboardService,
    FinancialReportsService,
    InventoryReportsService,
  ],
})
export class ReportsModule {}
