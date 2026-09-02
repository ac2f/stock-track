import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { SettingsService } from './settings.service';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateTelegramDto } from './dto/update-telegram.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { UpdateDisplayDto } from './dto/update-display.dto';

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

  /**
   * Görünüm tercihleri. Okuma tüm oturum açmışlarda — arayüz düğmeleri
   * buna göre çizilir.
   */
  @Get('display')
  getDisplay() {
    return this.settings.getDisplay();
  }

  @Roles(UserRole.OWNER)
  @Put('display')
  updateDisplay(@Body() dto: UpdateDisplayDto) {
    return this.settings.updateDisplay(dto);
  }

  /** Satış kâr yüzdesi ve konsinye komisyon oranı. */
  @Get('pricing')
  getPricing() {
    return this.settings.getPricing();
  }

  @Roles(UserRole.OWNER)
  @Put('pricing')
  updatePricing(@Body() dto: UpdatePricingDto) {
    return this.settings.updatePricing(dto);
  }

  /**
   * Telegram ayarlarının durumu (jeton maskeli) — mesajların gideceği sohbet
   * kimlikleri burada görünür.
   */
  @Roles(UserRole.OWNER)
  @Get('telegram')
  getTelegram() {
    return this.settings.getTelegramStatus();
  }

  /** Telegram jetonu/sohbet kimliklerini arayüzden düzenler (anında geçerli). */
  @Roles(UserRole.OWNER)
  @Put('telegram')
  updateTelegram(@Body() dto: UpdateTelegramDto) {
    return this.settings.updateTelegram(dto);
  }
}
