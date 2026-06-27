import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { MaterialTemplate } from './entities/material-template.entity';
import { MaterialPlate } from './entities/material-plate.entity';
import { MaterialCategoryEntity } from './entities/material-category.entity';
import { SupplierMaterialPrice } from './entities/supplier-material-price.entity';
import { StockLevel } from './entities/stock-level.entity';
import { MaterialTemplatesController } from './controllers/material-templates.controller';
import { MaterialCategoriesController } from './controllers/material-categories.controller';
import { PlatesController } from './controllers/plates.controller';
import { MaterialTemplatesService } from './services/material-templates.service';
import { MaterialCategoriesService } from './services/material-categories.service';
import { PlatesService } from './services/plates.service';
import { SupplierPricesService } from './services/supplier-prices.service';

/**
 * Stok & Tedarik çekirdeği:
 * - Şablonlar (tekrarı önler)
 * - Plakalar (stok SKU)
 * - Tedarikçi piyasa fiyatları (karşılaştırma)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MaterialTemplate,
      MaterialPlate,
      MaterialCategoryEntity,
      SupplierMaterialPrice,
      StockLevel,
    ]),
    SuppliersModule,
    WarehousesModule,
  ],
  controllers: [
    MaterialCategoriesController,
    MaterialTemplatesController,
    PlatesController,
  ],
  providers: [
    MaterialCategoriesService,
    MaterialTemplatesService,
    PlatesService,
    SupplierPricesService,
  ],
  // Satın alma & işleme modülleri stok ayarı için PlatesService kullanır.
  exports: [PlatesService, MaterialTemplatesService, MaterialCategoriesService],
})
export class MaterialsModule {}
