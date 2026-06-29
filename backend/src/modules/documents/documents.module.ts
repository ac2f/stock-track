import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { ProcessingModule } from '../processing/processing.module';
import { QuotesModule } from '../quotes/quotes.module';
import { CustomersModule } from '../customers/customers.module';
import { ReportsModule } from '../reports/reports.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { SettingsModule } from '../settings/settings.module';
import { DocumentsController } from './documents.controller';
import { ExportService } from './services/export.service';
import { QuoteDocumentService } from './services/quote-document.service';
import { DocumentHtmlService } from './services/document-html.service';

/**
 * Belge üretimi: yazdırılabilir HTML belgeler (fatura/fiş/teklif/cari ekstre/
 * gider-mali rapor) ve Excel/CSV dışa aktarım. Mevcut servisleri (satış/işleme/
 * teklif/müşteri/rapor/gider) tüketir.
 */
@Module({
  imports: [
    SalesModule,
    ProcessingModule,
    QuotesModule,
    CustomersModule,
    ReportsModule,
    ExpensesModule,
    SettingsModule,
  ],
  controllers: [DocumentsController],
  providers: [ExportService, QuoteDocumentService, DocumentHtmlService],
})
export class DocumentsModule {}
