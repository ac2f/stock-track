import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { CustomersModule } from '../customers/customers.module';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { MaterialSize } from '../materials/entities/material-size.entity';
import { MaterialsModule } from '../materials/materials.module';
import { SalesModule } from '../sales/sales.module';
import { Shop } from '../shops/entities/shop.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { ShopTransferItem } from './entities/shop-transfer-item.entity';
import { ShopTransfer } from './entities/shop-transfer.entity';
import { ShopTransfersController } from './shop-transfers.controller';
import { ShopTransfersService } from './shop-transfers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShopTransfer,
      ShopTransferItem,
      Shop,
      Customer,
      Supplier,
      MaterialPlate,
      MaterialSize,
    ]),
    SalesModule, // satan dükkânda satış (stok + cari)
    MaterialsModule, // stok girişi + karşı dükkânda şablon eşleme
    WarehousesModule, // alan dükkânın varsayılan deposu
    CustomersModule, // iptalde cari bakiyesinin yeniden hesabı
  ],
  controllers: [ShopTransfersController],
  providers: [ShopTransfersService],
})
export class ShopTransfersModule {}
