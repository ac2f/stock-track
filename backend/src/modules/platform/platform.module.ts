import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GeoModule } from '../geo/geo.module';
import { Machine } from '../processing/entities/machine.entity';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { ShopMember } from '../shops/entities/shop-member.entity';
import { Shop } from '../shops/entities/shop.entity';
import { User } from '../users/entities/user.entity';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessProfileService } from './business-profile.service';
import { BusinessesService } from './businesses.service';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { BusinessLabel } from './entities/business-label.entity';
import { MachineTypeSize } from './entities/machine-type-size.entity';
import { MachineType } from './entities/machine-type.entity';
import { ShopLabel } from './entities/shop-label.entity';
import { LabelsService } from './labels.service';
import { MachineTypesService } from './machine-types.service';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformSettingsService } from './platform-settings.service';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

/**
 * Platform: sistemin birden çok işletmeye kiralanması — kayıt, onay ve kiralama
 * süresi, iş kolu etiketleri, makine türleri ve işletme rehberi.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Shop,
      ShopMember,
      User,
      Machine,
      SystemSetting,
      BusinessLabel,
      ShopLabel,
      MachineType,
      MachineTypeSize,
    ]),
    GeoModule,
    AuthModule,
  ],
  controllers: [
    PlatformAdminController,
    RegistrationController,
    DirectoryController,
    BusinessProfileController,
  ],
  providers: [
    PlatformSettingsService,
    LabelsService,
    MachineTypesService,
    BusinessesService,
    BusinessProfileService,
    DirectoryService,
    RegistrationService,
  ],
  exports: [MachineTypesService, LabelsService, PlatformSettingsService],
})
export class PlatformModule {}
