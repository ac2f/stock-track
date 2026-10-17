import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { StockLevel } from '../materials/entities/stock-level.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { SettingsModule } from '../settings/settings.module';
import { CorelController } from './corel.controller';
import { CorelKeyGuard } from './corel-key.guard';
import { CorelService } from './corel.service';

/**
 * CorelDRAW eklentisi entegrasyonu: müşteri bağlama, stoktan malzeme
 * seçimi ve teklifte kullanılan tabaka ölçüleri için salt-okunur listeler
 * (anahtarla korunur).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, MaterialPlate, StockLevel, Quote]),
    SettingsModule, // anahtar ve işletme adı
  ],
  controllers: [CorelController],
  providers: [CorelService, CorelKeyGuard],
})
export class CorelModule {}
