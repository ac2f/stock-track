import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialsModule } from '../materials/materials.module';
import { CustomersModule } from '../customers/customers.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { CurrencyModule } from '../currency/currency.module';
import { ProcessingRate } from './entities/processing-rate.entity';
import { ProcessingJob } from './entities/processing-job.entity';
import { ProcessingRatesController } from './controllers/processing-rates.controller';
import { ProcessingController } from './controllers/processing.controller';
import { ProcessingRatesService } from './services/processing-rates.service';
import { ProcessingService } from './services/processing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcessingRate, ProcessingJob]),
    MaterialsModule, // stok düşümü (PlatesService)
    CustomersModule, // cariye borç yazımı (CustomerAccountService)
    WarehousesModule, // kaynak depo çözümü
    CurrencyModule, // baz para çevrimi
  ],
  controllers: [ProcessingRatesController, ProcessingController],
  providers: [ProcessingRatesService, ProcessingService],
})
export class ProcessingModule {}
