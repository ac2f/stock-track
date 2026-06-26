import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { ProcessingModule } from '../processing/processing.module';
import { QuotesModule } from '../quotes/quotes.module';
import { CustomersModule } from '../customers/customers.module';
import { ReportsModule } from '../reports/reports.module';
import { DocumentsController } from './documents.controller';
import { PdfService } from './services/pdf.service';
import { ExportService } from './services/export.service';

/**
 * Belge üretimi: PDF (fatura/irsaliye/teklif/cari ekstresi) ve Excel/CSV dışa
 * aktarım. Mevcut servisleri (satış/işleme/teklif/müşteri/rapor) tüketir.
 */
@Module({
  imports: [
    SalesModule,
    ProcessingModule,
    QuotesModule,
    CustomersModule,
    ReportsModule,
  ],
  controllers: [DocumentsController],
  providers: [PdfService, ExportService],
})
export class DocumentsModule {}
