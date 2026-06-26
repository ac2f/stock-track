import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { Sale } from '../sales/entities/sale.entity';
import { ProcessingJob } from '../processing/entities/processing-job.entity';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, ProcessingJob]),
    CustomersModule, // CustomersService + CustomerAccountService
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
