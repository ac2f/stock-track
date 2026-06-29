import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { SettingsService } from './settings.service';
import { UpdateBusinessDto } from './dto/update-business.dto';

/**
 * Ayarlar. İşletme/proje kimliği (ad, adres, telefon, VKN, logo, portal adresi)
 * tek ekrandan düzenlenir. Okuma tüm oturum açmış kullanıcılarda (başlık/belge
 * için); yazma yalnızca İşletme Sahibi.
 */
@ApiTags('settings')
@ApiBearerAuth()
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('business')
  getBusiness() {
    return this.settings.getBusiness();
  }

  @Roles(UserRole.OWNER)
  @Put('business')
  updateBusiness(@Body() dto: UpdateBusinessDto) {
    return this.settings.update(dto);
  }
}
