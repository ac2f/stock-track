import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { CurrencyModule } from '../currency/currency.module';
import { CustomersModule } from '../customers/customers.module';
import { MaterialTemplate } from './entities/material-template.entity';
import { MaterialPlate } from './entities/material-plate.entity';
import { MaterialCategoryEntity } from './entities/material-category.entity';
import { MaterialBrand } from './entities/material-brand.entity';
import { MaterialColor } from './entities/material-color.entity';
import { MaterialSize } from './entities/material-size.entity';
import { MaterialThickness } from './entities/material-thickness.entity';
import { SupplierMaterialPrice } from './entities/supplier-material-price.entity';
import { StockLevel } from './entities/stock-level.entity';
import { MaterialTemplatesController } from './controllers/material-templates.controller';
import { MaterialCategoriesController } from './controllers/material-categories.controller';
import { MaterialBrandsController } from './controllers/material-brands.controller';
import { MaterialColorsController } from './controllers/material-colors.controller';
import { MaterialSizesController } from './controllers/material-sizes.controller';
import { MaterialThicknessesController } from './controllers/material-thicknesses.controller';
import { PlatesController } from './controllers/plates.controller';
import { MaterialTemplatesService } from './services/material-templates.service';
import { MaterialCategoriesService } from './services/material-categories.service';
import { MaterialBrandsService } from './services/material-brands.service';
import { MaterialColorsService } from './services/material-colors.service';
import { MaterialSizesService } from './services/material-sizes.service';
import { MaterialThicknessesService } from './services/material-thicknesses.service';
import { PlatesService } from './services/plates.service';
import { SupplierPricesService } from './services/supplier-prices.service';

/**
 * Stok & Tedarik çekirdeği:
 * - Şablonlar (tekrarı önler)
 * - Kategoriye özel kataloglar (marka/renk/ebat/kalınlık)
 * - Plakalar (stok SKU)
 * - Tedarikçi piyasa fiyatları (karşılaştırma)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MaterialTemplate,
      MaterialPlate,
      MaterialCategoryEntity,
      MaterialBrand,
      MaterialColor,
      MaterialSize,
      MaterialThickness,
      SupplierMaterialPrice,
      StockLevel,
    ]),
    SuppliersModule,
    WarehousesModule,
    CurrencyModule,
    CustomersModule, // konsinye sahibini (müşteri) doğrulamak için
  ],
  controllers: [
    MaterialCategoriesController,
    MaterialBrandsController,
    MaterialColorsController,
    MaterialSizesController,
    MaterialThicknessesController,
    MaterialTemplatesController,
    PlatesController,
  ],
  providers: [
    MaterialCategoriesService,
    MaterialBrandsService,
    MaterialColorsService,
    MaterialSizesService,
    MaterialThicknessesService,
    MaterialTemplatesService,
    PlatesService,
    SupplierPricesService,
  ],
  // Satın alma & işleme modülleri stok ayarı için PlatesService kullanır.
  exports: [PlatesService, MaterialTemplatesService, MaterialCategoriesService],
})
export class MaterialsModule {}
