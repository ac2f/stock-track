import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { MaterialTemplate } from './entities/material-template.entity';
import { MaterialPlate } from './entities/material-plate.entity';
import { SupplierMaterialPrice } from './entities/supplier-material-price.entity';
import { MaterialTemplatesController } from './controllers/material-templates.controller';
import { PlatesController } from './controllers/plates.controller';
import { MaterialTemplatesService } from './services/material-templates.service';
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
      SupplierMaterialPrice,
    ]),
    SuppliersModule,
  ],
  controllers: [MaterialTemplatesController, PlatesController],
  providers: [MaterialTemplatesService, PlatesService, SupplierPricesService],
  // Satın alma & işleme modülleri stok ayarı için PlatesService kullanır.
  exports: [PlatesService, MaterialTemplatesService],
})
export class MaterialsModule {}
