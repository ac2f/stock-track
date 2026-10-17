import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../../common/decorators/current-shop.decorator';
import type { ShopAccessInfo } from '../shops/shop-access.service';
import { SettingsService } from './settings.service';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateTelegramDto } from './dto/update-telegram.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { UpdateDisplayDto } from './dto/update-display.dto';
import { UpdateCutPricingDto } from './dto/update-cut-pricing.dto';
import { UpdateMorningSummaryDto } from './dto/update-morning-summary.dto';
import { AnyShopMember, ShopAccess, ShopScope } from '../../common/shop/shop-access.decorator';

/**
 * Dükkân ayarları. İşletme/proje kimliği (ad, adres, telefon, VKN, logo,
 * portal adresi), fiyatlar, bildirim sohbeti, Corel anahtarı ... her dükkânın
 * kendisinindir. Arayüzün ve formların ihtiyaç duyduğu okumalar dükkânın her
 * üyesine açıktır; gerisi "Dükkân ayarları" iznine bağlıdır.
 */
@ApiTags('settings')
@ApiBearerAuth()
@ShopScope('settings')
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @AnyShopMember()
  @Get('business')
  getBusiness() {
    return this.settings.getBusiness();
  }

  @Put('business')
  updateBusiness(@Body() dto: UpdateBusinessDto) {
    return this.settings.update(dto);
  }

  /**
   * Görünüm tercihleri. Okuma tüm oturum açmışlarda — arayüz düğmeleri
   * buna göre çizilir.
   */
  @AnyShopMember()
  @Get('display')
  getDisplay() {
    return this.settings.getDisplay();
  }

  @Put('display')
  updateDisplay(@Body() dto: UpdateDisplayDto) {
    return this.settings.updateDisplay(dto);
  }

  /** Satış kâr yüzdesi ve konsinye komisyon oranı. */
  @AnyShopMember()
  @Get('pricing')
  getPricing() {
    return this.settings.getPricing();
  }

  @Put('pricing')
  updatePricing(@Body() dto: UpdatePricingDto) {
    return this.settings.updatePricing(dto);
  }

  /**
   * Kesim fiyatlandırması: saatlik ücret ve asgari süre, m² ücreti ve asgari
   * alan, makine hızları. Okuma her üyeye (teklif ekranı varsayılan fiyatı
   * buradan alır).
   */
  @AnyShopMember()
  @Get('cut-pricing')
  getCutPricing() {
    return this.settings.getCutPricing();
  }

  @Put('cut-pricing')
  updateCutPricing(@Body() dto: UpdateCutPricingDto) {
    return this.settings.updateCutPricing(dto);
  }

  /** Sabah özeti (Telegram): açık/kapalı ve gönderim zamanı. */
  @Get('morning-summary')
  getMorningSummary() {
    return this.settings.getMorningSummary();
  }

  @Put('morning-summary')
  updateMorningSummary(@Body() dto: UpdateMorningSummaryDto) {
    return this.settings.updateMorningSummary(dto.enabled);
  }

  /**
   * CorelDRAW eklentisinin anahtarı. Eklentinin ayarına bir kez yapıştırılır;
   * bu dükkânın müşteri ve stok listesini okumasını sağlar. Anahtar bir tür
   * paroladır: yalnız ayarları değiştirebilenler görür.
   */
  @ShopAccess('settings', 'write')
  @Get('corel')
  getCorel() {
    return this.settings.getCorelStatus();
  }

  /** Yeni anahtar üretir; eski anahtarla gelen istekler reddedilir. */
  @Post('corel/rotate')
  rotateCorel() {
    return this.settings.rotateCorelKey();
  }

  /** Anahtarı siler, entegrasyonu kapatır. */
  @Delete('corel')
  disableCorel() {
    return this.settings.disableCorelKey();
  }

  /**
   * Telegram ayarlarının durumu (jeton maskeli) — mesajların gideceği sohbet
   * kimlikleri burada görünür.
   */
  @Get('telegram')
  getTelegram() {
    return this.settings.getTelegramStatus();
  }

  /**
   * Telegram jetonu/sohbet kimliklerini arayüzden düzenler (anında geçerli).
   * Bildirim sohbeti dükkânın; bot jetonu, yedek sohbeti ve yetkili
   * kullanıcılar sistemin (yalnız sistem sahibi).
   */
  @Put('telegram')
  updateTelegram(@Body() dto: UpdateTelegramDto, @CurrentShop() shop: ShopAccessInfo) {
    return this.settings.updateTelegram(dto, shop.isOwner);
  }
}
