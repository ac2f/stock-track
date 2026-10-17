import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { SettingsService } from './settings.service';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateTelegramDto } from './dto/update-telegram.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { UpdateDisplayDto } from './dto/update-display.dto';
import { UpdateCutPricingDto } from './dto/update-cut-pricing.dto';
import { UpdateMorningSummaryDto } from './dto/update-morning-summary.dto';

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
   * Kesim fiyatlandırması: saatlik ücret ve asgari süre, m² ücreti ve asgari
   * alan, makine hızları. Okuma herkese (teklif ekranı varsayılan fiyatı
   * buradan alır); yazma yalnız İşletme Sahibi.
   */
  @Get('cut-pricing')
  getCutPricing() {
    return this.settings.getCutPricing();
  }

  @Roles(UserRole.OWNER)
  @Put('cut-pricing')
  updateCutPricing(@Body() dto: UpdateCutPricingDto) {
    return this.settings.updateCutPricing(dto);
  }

  /** Sabah özeti (Telegram): açık/kapalı ve gönderim zamanı. */
  @Roles(UserRole.OWNER)
  @Get('morning-summary')
  getMorningSummary() {
    return this.settings.getMorningSummary();
  }

  @Roles(UserRole.OWNER)
  @Put('morning-summary')
  updateMorningSummary(@Body() dto: UpdateMorningSummaryDto) {
    return this.settings.updateMorningSummary(dto.enabled);
  }

  /**
   * CorelDRAW eklentisinin anahtarı. Eklentinin ayarına bir kez yapıştırılır;
   * müşteri ve stok listesini okumasını sağlar.
   */
  @Roles(UserRole.OWNER)
  @Get('corel')
  getCorel() {
    return this.settings.getCorelStatus();
  }

  /** Yeni anahtar üretir; eski anahtarla gelen istekler reddedilir. */
  @Roles(UserRole.OWNER)
  @Post('corel/rotate')
  rotateCorel() {
    return this.settings.rotateCorelKey();
  }

  /** Anahtarı siler, entegrasyonu kapatır. */
  @Roles(UserRole.OWNER)
  @Delete('corel')
  disableCorel() {
    return this.settings.disableCorelKey();
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
