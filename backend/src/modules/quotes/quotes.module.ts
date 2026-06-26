import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialsModule } from '../materials/materials.module';
import { CustomersModule } from '../customers/customers.module';
import { CurrencyModule } from '../currency/currency.module';
import { SalesModule } from '../sales/sales.module';
import { ProcessingModule } from '../processing/processing.module';
import { Quote } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './services/quotes.service';

/**
 * Teklif (proforma) modülü. Onaylanan teklif, mevcut SalesService ve
 * ProcessingService üzerinden gerçeğe dönüştürülür (sıfır kopya muhasebe/stok).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, QuoteItem]),
    MaterialsModule, // plaka çözümü (PlatesService)
    CustomersModule, // müşteri doğrulaması (CustomersService)
    CurrencyModule, // baz para çevrimi
    SalesModule, // satış dönüşümü (SalesService)
    ProcessingModule, // işleme dönüşümü (ProcessingService)
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
