import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialsModule } from '../materials/materials.module';
import { CustomersModule } from '../customers/customers.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { CurrencyModule } from '../currency/currency.module';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem]),
    MaterialsModule, // PlatesService (stok düşümü)
    CustomersModule, // alıcı borcu + sahip alacağı (CustomerAccountService/CustomersService)
    WarehousesModule, // kaynak depo
    CurrencyModule, // baz para çevrimi
  ],
  controllers: [SalesController],
  providers: [SalesService],
  // Teklif modülü, dönüşümde SalesService.persist kullanır.
  exports: [SalesService],
})
export class SalesModule {}
