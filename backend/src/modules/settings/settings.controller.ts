import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../../common/decorators/current-shop.decorator';
import type { ShopAccessInfo } from '../shops/shop-access.service';
import {
  businessView,
  COREL_ONLY_CUT_FIELDS,
  cutPricingView,
  SettingsService,
} from './settings.service';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateTelegramDto } from './dto/update-telegram.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { UpdateDisplayDto } from './dto/update-display.dto';
import { UpdateCutPricingDto } from './dto/update-cut-pricing.dto';
import { UpdateMorningSummaryDto } from './dto/update-morning-summary.dto';
import { UpdateFolderSettingsDto } from './dto/update-folder-settings.dto';
import {
  AnyShopMember,
  ShopAccess,
  ShopFeatureRequired,
  ShopScope,
} from '../../common/shop/shop-access.decorator';
import { PrimaryOnly } from '../sync/sync.decorators';
import { Cached } from '../../common/cache/cached.decorator';
import { CacheGroup } from '../../common/cache/cache.groups';

/**
 * Dükkân ayarları. İşletme/proje kimliği (ad, adres, telefon, VKN), fiyatlar,
 * bildirim sohbeti ... her dükkânın kendisinindir. Arayüzün ve formların
 * ihtiyaç duyduğu okumalar dükkânın her üyesine açıktır; gerisi "Dükkân
 * ayarları" iznine bağlıdır.
 *
 * Sistem ve platform ayarları İŞLETMEYE GÖNDERİLMEZ (alan bile yoktur):
 *  - Telegram bot jetonu, yedek sohbeti, yetkili kullanıcılar → yalnız sistem sahibi.
 *  - Portal temel adresi, logo yolu → yalnız sistem sahibi görür ve değiştirir.
 *  - Corel / runner / klasör oluşturucu → yalnız sistem sahibinin açtığı işletmeler.
 */
@ApiTags('settings')
@ApiBearerAuth()
@ShopScope('settings')
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Yanıt, oturumdaki kullanıcının rolüne göre değişir (portal adresi yalnız sistem sahibine)
  // → önbellek kullanıcı başınadır.
  @Cached({ group: CacheGroup.SETTINGS, ttl: 300, perUser: true })
  @AnyShopMember()
  @Get('business')
  async getBusiness(@CurrentShop() shop: ShopAccessInfo) {
    return businessView(await this.settings.getBusiness(), shop.isOwner);
  }

  @Put('business')
  updateBusiness(@Body() dto: UpdateBusinessDto, @CurrentShop() shop: ShopAccessInfo) {
    return this.settings.update(dto, shop.isOwner);
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
   * İşleme / hizmet fiyatlandırması — tek menü: m², metre, süre (saatlik ücret
   * ve asgari süre), adet. Okuma her üyeye (teklif ekranı varsayılan fiyatı
   * buradan alır). Makine hızları ve asgari alan yalnız Corel özelliği açık
   * işletmeye döner.
   */
  @AnyShopMember()
  @Get('cut-pricing')
  async getCutPricing(@CurrentShop() shop: ShopAccessInfo) {
    return cutPricingView(await this.settings.getCutPricing(), shop.features);
  }

  @Put('cut-pricing')
  async updateCutPricing(@Body() dto: UpdateCutPricingDto, @CurrentShop() shop: ShopAccessInfo) {
    const patch: UpdateCutPricingDto = { ...dto };
    // Corel özelliği kapalı işletme Corel'e özgü alanları yazamaz (arayüz zaten göstermez).
    if (!shop.features.corel) for (const f of COREL_ONLY_CUT_FIELDS) delete patch[f];
    await this.settings.updateCutPricing(patch);
    return cutPricingView(await this.settings.getCutPricing(), shop.features);
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
   * paroladır: yalnız ayarları değiştirebilenler görür. Özellik, sistem
   * sahibinin işletmeye açtığı bir hizmettir.
   */
  @ShopFeatureRequired('corel')
  @ShopAccess('settings', 'write')
  @Get('corel')
  getCorel() {
    return this.settings.getCorelStatus();
  }

  /** Yeni anahtar üretir; eski anahtarla gelen istekler reddedilir. */
  @ShopFeatureRequired('corel')
  @PrimaryOnly()
  @Post('corel/rotate')
  rotateCorel() {
    return this.settings.rotateCorelKey();
  }

  /** Anahtarı siler, entegrasyonu kapatır. */
  @ShopFeatureRequired('corel')
  @PrimaryOnly()
  @Delete('corel')
  disableCorel() {
    return this.settings.disableCorelKey();
  }

  /**
   * Dükkânın klasör oluşturucusu (runner): açık mı, belirteçteki işletme
   * kodu, malzeme satışına klasör, bu dükkânın gün klasörü kökü.
   */
  @ShopFeatureRequired('corel')
  @Get('folders')
  getFolders() {
    return this.settings.getFolderSettings();
  }

  @ShopFeatureRequired('corel')
  @Put('folders')
  updateFolders(@Body() dto: UpdateFolderSettingsDto) {
    return this.settings.updateFolderSettings(dto);
  }

  /**
   * Telegram durumu. İşletme yalnız kendi bildirim sohbetini, konu hedeflerini
   * ve botun kullanıcı adını görür; bot jetonu, yedek sohbeti, yetkili
   * kullanıcılar ve başka işletmelerin adları yalnız sistem sahibine döner.
   */
  @Get('telegram')
  getTelegram(@CurrentShop() shop: ShopAccessInfo) {
    return this.settings.getTelegramStatus(shop.isOwner, shop.features);
  }

  /**
   * Telegram ayarlarını arayüzden düzenler (anında geçerli). Bildirim sohbeti
   * ve konu hedefleri dükkânın; bot jetonu, yedek sohbeti ve yetkili
   * kullanıcılar sistemin (yalnız sistem sahibi). Tek bir sistem botu vardır:
   * işletme jeton girmez, botu kendi grubuna ekleyip grubun kimliğini yazar.
   */
  @PrimaryOnly()
  @Put('telegram')
  updateTelegram(@Body() dto: UpdateTelegramDto, @CurrentShop() shop: ShopAccessInfo) {
    return this.settings.updateTelegram(dto, shop.isOwner, shop.features);
  }
}
