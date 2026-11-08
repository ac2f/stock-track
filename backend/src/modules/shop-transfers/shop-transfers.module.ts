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
import { MaterialTemplate } from '../materials/entities/material-template.entity';
import { MaterialCategoryEntity } from '../materials/entities/material-category.entity';
import { ShopPartnerGrant } from './entities/shop-partner-grant.entity';
import { ShopStockShare } from './entities/shop-stock-share.entity';
import { PartnerGrantsService } from './partner-grants.service';
import { StockSharesService } from './stock-shares.service';
import { MarketplaceController, PartnersController, StockSharesController } from './trade.controller';
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
      MaterialTemplate,
      MaterialCategoryEntity,
      ShopPartnerGrant,
      ShopStockShare,
    ]),
    SalesModule, // satan dükkânda satış (stok + cari)
    MaterialsModule, // stok girişi + karşı dükkânda şablon eşleme
    WarehousesModule, // alan dükkânın varsayılan deposu
    CustomersModule, // iptalde cari bakiyesinin yeniden hesabı
  ],
  controllers: [ShopTransfersController, PartnersController, StockSharesController, MarketplaceController],
  providers: [ShopTransfersService, PartnerGrantsService, StockSharesService],
})
export class ShopTransfersModule {}
