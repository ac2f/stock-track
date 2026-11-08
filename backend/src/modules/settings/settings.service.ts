import { randomBytes, timingSafeEqual } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BackupConfig,
  BusinessConfig,
  NotificationsConfig,
} from '../../config/configuration';
import { ShopContext } from '../../common/shop/shop-context';
import { ShopFeatures } from '../../common/shop/shop-features';
import { AppSetting } from './entities/app-setting.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateTelegramDto } from './dto/update-telegram.dto';
import { UpdateFolderSettingsDto } from './dto/update-folder-settings.dto';
import { folderCode, nameToken } from '../corel/corel-naming.util';
import {
  isTopic,
  NOTIFICATION_TOPICS,
  NotificationTopic,
} from '../notifications/enums/notification-topic';

/** Belgelerde/portalda kullanılan, çözülmüş işletme kimliği. */
export interface ResolvedBusiness {
  name: string;
  address: string;
  phone: string;
  taxNo: string;
  logoPath: string;
  portalBaseUrl: string;
  defaultCurrency: string;
}

/** Gönderim anında çözülmüş Telegram ayarları (DB → .env yedeği). */
export interface ResolvedTelegram {
  botToken: string;
  /** Bildirim/hatırlatmaların gideceği sohbet. */
  chatId: string;
  /** Şifreli yedeğin gideceği sohbet (boşsa bildirim sohbetine düşer). */
  backupChatId: string;
}

/** Satış fiyatlandırma ayarları. */
export interface PricingSettings {
  /** Perakende fiyatın üzerine eklenen genel kâr yüzdesi. */
  saleMarkupPercent: number;
  /** Başkasının malzemesi satılırken varsayılan komisyon yüzdesi. */
  consignmentCommissionPercent: number;
}

/** Arayüz görünüm tercihleri. */
export interface DisplaySettings {
  /**
   * Cari ekstresinde "Geri al" düğmeleri görünsün mü? Varsayılan kapalıdır —
   * ekran müşteriye gösterildiğinde yanlış anlaşılmasın diye.
   */
  showLedgerUndo: boolean;
}

/** Kesim fiyatlandırması (teklif + Corel fiyat tahmini). */
export interface CutPricingSettings {
  hourlyRate: number;
  minMinutes: number;
  areaRate: number;
  /** Metre ile faturalanan işin metre ücreti. */
  meterRate: number;
  /** Adetle faturalanan işin adet ücreti. */
  pieceRate: number;
  minArea: number;
  feedMmS: number;
  rapidMmS: number;
  plungeSec: number;
  passDepthMm: number;
  /** Ücretlerin para birimi (baz para birimi). */
  currency: string;
}

/** Sabah özeti: açık mı, ne zaman gider. */
export interface MorningSummarySettings {
  enabled: boolean;
  cron: string;
}

/** Corel eklentisi entegrasyonu: anahtar yalnızca İşletme Sahibine döner. */
export interface CorelIntegrationStatus {
  enabled: boolean;
  apiKey: string;
}

/** Corel anahtarı denetiminin sonucu. */
export type CorelKeyCheck = 'ok' | 'invalid' | 'disabled';

/**
 * Dükkânın klasör oluşturucusu (runner). Runner dükkânın anahtarıyla
 * bağlanınca bunları okur; her dükkânın kendi ayarı vardır.
 */
export interface FolderSettings {
  shopName: string;
  enabled: boolean;
  /** Belirteçte kullanılan kod (yazılan ya da dükkân adından). */
  code: string;
  /** Ayarda yazılan kod; boş = dükkân adından türetiliyor. */
  customCode: string;
  materialSaleFolders: boolean;
  dayRoot: string;
}

/** Bir konunun Telegram hedefi (arayüz ve gönderim). */
export interface TelegramRouteView {
  topic: NotificationTopic;
  label: string;
  hint: string;
  /** 'default' bildirim sohbeti, 'chat' başka sohbet, 'off' kapalı. */
  mode: 'default' | 'chat' | 'off';
  chatId: string;
  /** Mesajın gerçekte gideceği sohbet (kapalıysa boş). */
  effectiveChatId: string;
  /** Aynı sohbete bildirim gönderen diğer dükkânlar. */
  sharedWith: string[];
}

/** Ayar değerinin nereden geldiği — arayüzde gösterilir. */
export type SettingSource = 'db' | 'env' | 'none';

/**
 * Arayüze dönen Telegram durumu.
 *
 * İKİ GÖRÜNÜM vardır:
 *  - İşletme (varsayılan): yalnız kendi bildirim sohbeti ve konu hedefleri,
 *    botun kullanıcı adı (gruba eklemek için) ve hazır olup olmadığı. Bot
 *    JETONU, yedek sohbeti, yetkili kullanıcılar, .env değerleri ve başka
 *    işletmelerin adları İŞLETMEYE ASLA GÖNDERİLMEZ (alan bile yoktur).
 *  - Sistem sahibi (`ownerView`): hepsi; jeton yine maskelenmiş.
 */
export interface TelegramStatus {
  /** Bildirimler gidebilir durumda mı (bot hazır ve sohbet tanımlı). */
  configured: boolean;
  /** Sistem botu hazır mı — jetonun kendisi değil, yalnız var/yok. */
  botReady: boolean;
  /** Botun kullanıcı adı (@olmadan): işletme botu kendi grubuna bununla ekler. */
  botUsername: string | null;
  /** Bu dükkânın bildirim sohbeti. */
  chatId: string;
  /** Konu başına hedefler. */
  routes: TelegramRouteView[];
  /** true → aşağıdaki sistem alanları dolu (yalnız sistem sahibi). */
  ownerView: boolean;

  // ── Yalnız sistem sahibine ──
  tokenSet?: boolean;
  tokenMasked?: string;
  tokenSource?: SettingSource;
  chatIdSource?: SettingSource;
  backupChatId?: string;
  /** Yedeğin gerçekte gideceği sohbet (backupChatId boşsa chatId). */
  effectiveBackupChatId?: string;
  backupCron?: string;
  /** Telegram'dan işlem yapabilecek kullanıcı kimlikleri. */
  allowedUserIds?: string[];
  /** Bildirim sohbetini kullanan diğer dükkânlar. */
  chatSharedWith?: string[];
}

/** Telegram sohbet kimliği: sayısal (grup/kanal negatif) ya da @kanaladı. */
export const CHAT_ID_RE = /^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/;

/** Başka işletmelerden gelen çözümlenmiş işletme kimliğinden, görüntüleyene uygun olanı. */
export function businessView(b: ResolvedBusiness, isOwner: boolean): ResolvedBusiness {
  // Portal adresi ve logo yolu sunucu/platform ayarıdır: yalnız sistem sahibi görür ve değiştirir.
  return isOwner ? b : { ...b, portalBaseUrl: '', logoPath: '' };
}

/** Corel'e özgü kesim alanları (Corel özelliği kapalı işletmeye gösterilmez). */
export const COREL_ONLY_CUT_FIELDS = ['minArea', 'feedMmS', 'rapidMmS', 'plungeSec', 'passDepthMm'] as const;

/** Kesim fiyatlandırmasından, işletmenin özelliklerine uygun olan görünüm. */
export function cutPricingView(
  c: CutPricingSettings,
  features: Pick<ShopFeatures, 'corel'>,
): Partial<CutPricingSettings> {
  if (features.corel) return c;
  const out: Partial<CutPricingSettings> = { ...c };
  for (const f of COREL_ONLY_CUT_FIELDS) delete out[f];
  return out;
}

/**
 * Çalışma-zamanı ayarları. Her dükkânın kendi satırı vardır (işletme kimliği,
 * fiyatlar, bildirim sohbeti, Corel anahtarı ...); o anki dükkân bağlamındaki
 * satır okunur. İlk erişimde .env (BusinessConfig) varsayılanlarından
 * tohumlanır. Bütün sisteme ait olanlar (Telegram botu, yetkili Telegram
 * kullanıcıları, yedek sohbeti) tek satırlık SystemSetting'dedir.
 */
@Injectable()
export class SettingsService {
  private readonly business: BusinessConfig;
  private readonly envNotifications: NotificationsConfig;
  private readonly envBackup: BackupConfig;

  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
    @InjectRepository(SystemSetting)
    private readonly systemRepo: Repository<SystemSetting>,
    configService: ConfigService,
  ) {
    this.business = configService.get<BusinessConfig>('business')!;
    this.envNotifications = configService.get<NotificationsConfig>('notifications')!;
    this.envBackup = configService.get<BackupConfig>('backup')!;
  }

  /** Dükkânın ayar satırını döndürür; yoksa .env varsayılanlarıyla oluşturur. */
  async getOrCreate(): Promise<AppSetting> {
    const existing = await this.repo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;
    const created = this.repo.create({
      businessName: this.business.name,
      businessAddress: this.business.address ?? '',
      businessPhone: this.business.phone ?? '',
      businessTaxNo: this.business.taxNo ?? '',
      businessLogoPath: this.business.logoPath ?? '',
      portalBaseUrl: this.business.portalBaseUrl ?? '',
      // Telegram alanları boş bırakılır; okuma sırasında .env'e düşülür.
      // Böylece .env'i güncelleyenler de çalışmaya devam eder.
      telegramBotToken: '',
      telegramChatId: '',
      backupTelegramChatId: '',
      telegramAllowedUserIds: '',
    });
    return this.repo.save(created);
  }

  /** Belge/portal için çözülmüş işletme kimliği (DB → .env yedeği). */
  async getBusiness(): Promise<ResolvedBusiness> {
    const s = await this.getOrCreate();
    return {
      name: s.businessName || this.business.name,
      address: s.businessAddress ?? '',
      phone: s.businessPhone ?? '',
      taxNo: s.businessTaxNo ?? '',
      logoPath: s.businessLogoPath ?? '',
      portalBaseUrl: s.portalBaseUrl || this.business.portalBaseUrl,
      defaultCurrency: this.business.defaultCurrency,
    };
  }

  /**
   * İşletme kimliğini günceller ve görüntüleyene uygun hâlini döndürür (ham
   * satır DEĞİL: satırda Corel anahtarı gibi alanlar vardır).
   *
   * Portal temel adresi ve logo yolu sunucu/platform ayarıdır: yalnız sistem
   * sahibi değiştirir. Bir işletme bunları değiştirirse müşterilerine giden
   * bağlantılar (portal jetonu dahil) başka bir adrese yönlenebilirdi.
   */
  async update(dto: UpdateBusinessDto, isOwner: boolean): Promise<ResolvedBusiness> {
    const patch: UpdateBusinessDto = { ...dto };
    if (!isOwner) {
      for (const key of ['portalBaseUrl', 'businessLogoPath'] as const) {
        const v = patch[key];
        if (v === undefined) continue;
        // Arayüz bu alanları işletmeye boş gösterir; boş değer "dokunma" demektir.
        if (v.trim() !== '') {
          throw new ForbiddenException(
            'Portal adresini ve logo yolunu yalnız sistem sahibi değiştirebilir.',
          );
        }
        delete patch[key];
      }
    }
    if (patch.portalBaseUrl !== undefined) {
      patch.portalBaseUrl = patch.portalBaseUrl.trim().replace(/\/+$/, '');
    }
    const s = await this.getOrCreate();
    Object.assign(s, patch);
    await this.repo.save(s);
    return businessView(await this.getBusiness(), isOwner);
  }

  // ── Görünüm ─────────────────────────────────────────────────────────

  /** Arayüz görünüm tercihleri (ekstrede geri alma düğmeleri vb.). */
  async getDisplay(): Promise<DisplaySettings> {
    const s = await this.getOrCreate();
    return { showLedgerUndo: !!s.showLedgerUndo };
  }

  async updateDisplay(dto: Partial<DisplaySettings>): Promise<DisplaySettings> {
    const s = await this.getOrCreate();
    if (dto.showLedgerUndo !== undefined) {
      s.showLedgerUndo = dto.showLedgerUndo;
    }
    await this.repo.save(s);
    return this.getDisplay();
  }

  // ── Fiyatlandırma ───────────────────────────────────────────────────

  /** Satış fiyatı ve komisyon oranları (satış anında okunur). */
  async getPricing(): Promise<PricingSettings> {
    const s = await this.getOrCreate();
    return {
      saleMarkupPercent: Number(s.saleMarkupPercent ?? 0),
      consignmentCommissionPercent: Number(s.consignmentCommissionPercent ?? 0),
    };
  }

  async updatePricing(dto: Partial<PricingSettings>): Promise<PricingSettings> {
    const s = await this.getOrCreate();
    if (dto.saleMarkupPercent !== undefined) {
      s.saleMarkupPercent = dto.saleMarkupPercent;
    }
    if (dto.consignmentCommissionPercent !== undefined) {
      s.consignmentCommissionPercent = dto.consignmentCommissionPercent;
    }
    await this.repo.save(s);
    return this.getPricing();
  }

  // ── Kesim fiyatlandırması ───────────────────────────────────────────

  async getCutPricing(): Promise<CutPricingSettings> {
    const s = await this.getOrCreate();
    return {
      hourlyRate: Number(s.cutHourlyRate ?? 0),
      minMinutes: Number(s.cutMinMinutes ?? 0),
      areaRate: Number(s.cutAreaRate ?? 0),
      meterRate: Number(s.cutMeterRate ?? 0),
      pieceRate: Number(s.cutPieceRate ?? 0),
      minArea: Number(s.cutMinArea ?? 0),
      feedMmS: Number(s.cutFeedMmS ?? 20),
      rapidMmS: Number(s.cutRapidMmS ?? 100),
      plungeSec: Number(s.cutPlungeSec ?? 1),
      passDepthMm: Number(s.cutPassDepthMm ?? 0),
      currency: this.business.defaultCurrency,
    };
  }

  async updateCutPricing(
    dto: Partial<Omit<CutPricingSettings, 'currency'>>,
  ): Promise<CutPricingSettings> {
    const s = await this.getOrCreate();
    const map: [keyof typeof dto, keyof AppSetting][] = [
      ['hourlyRate', 'cutHourlyRate'],
      ['minMinutes', 'cutMinMinutes'],
      ['areaRate', 'cutAreaRate'],
      ['meterRate', 'cutMeterRate'],
      ['pieceRate', 'cutPieceRate'],
      ['minArea', 'cutMinArea'],
      ['feedMmS', 'cutFeedMmS'],
      ['rapidMmS', 'cutRapidMmS'],
      ['plungeSec', 'cutPlungeSec'],
      ['passDepthMm', 'cutPassDepthMm'],
    ];
    for (const [from, to] of map) {
      if (dto[from] !== undefined) {
        (s as unknown as Record<string, number>)[to] = Number(dto[from]);
      }
    }
    await this.repo.save(s);
    return this.getCutPricing();
  }

  // ── Sabah özeti ─────────────────────────────────────────────────────

  async getMorningSummary(): Promise<MorningSummarySettings> {
    const s = await this.getOrCreate();
    return {
      enabled: !!s.morningSummaryEnabled,
      cron: process.env.MORNING_SUMMARY_CRON || '0 8 * * *',
    };
  }

  async updateMorningSummary(enabled: boolean): Promise<MorningSummarySettings> {
    const s = await this.getOrCreate();
    s.morningSummaryEnabled = enabled;
    await this.repo.save(s);
    return this.getMorningSummary();
  }

  // ── Corel entegrasyonu ──────────────────────────────────────────────

  async getCorelStatus(): Promise<CorelIntegrationStatus> {
    const s = await this.getOrCreate();
    const apiKey = s.corelApiKey?.trim() ?? '';
    return { enabled: !!apiKey, apiKey };
  }

  /** Yeni anahtar üretir; eskisi o anda geçersiz olur. */
  async rotateCorelKey(): Promise<CorelIntegrationStatus> {
    const s = await this.getOrCreate();
    s.corelApiKey = randomBytes(20).toString('hex');
    await this.repo.save(s);
    return this.getCorelStatus();
  }

  /** Anahtarı siler → entegrasyon kapanır. */
  async disableCorelKey(): Promise<CorelIntegrationStatus> {
    const s = await this.getOrCreate();
    s.corelApiKey = '';
    await this.repo.save(s);
    return this.getCorelStatus();
  }

  /**
   * Eklentinin gönderdiği anahtar hangi dükkânın? Her dükkânın kendi
   * anahtarı vardır; anahtar dükkânı da belirler. Karşılaştırma sabit
   * zamanlıdır.
   */
  async resolveCorelKey(candidate: string): Promise<{ check: CorelKeyCheck; shopId?: string }> {
    const rows = await ShopContext.unscoped(() =>
      this.repo
        .createQueryBuilder('s')
        .select(['s.id', 's.shopId', 's.corelApiKey'])
        .where("s.corel_api_key <> ''")
        .getMany(),
    );
    if (!rows.length) return { check: 'disabled' };
    const a = Buffer.from(candidate.trim());
    let shopId: string | undefined;
    for (const row of rows) {
      const b = Buffer.from(row.corelApiKey.trim());
      if (a.length === b.length && timingSafeEqual(a, b) && row.shopId) shopId = row.shopId;
    }
    return shopId ? { check: 'ok', shopId } : { check: 'invalid' };
  }

  // ── Klasör oluşturucu (runner) ──────────────────────────────────────

  /** O anki dükkânın adı (klasör kodu ve mesaj ön eki için). */
  async currentShopName(): Promise<string> {
    const shopId = ShopContext.shopId();
    if (!shopId) return '';
    const rows: { name: string }[] = await this.repo.query(
      'SELECT "name" FROM "shops" WHERE "id" = $1',
      [shopId],
    );
    return rows[0]?.name ?? '';
  }

  async getFolderSettings(): Promise<FolderSettings> {
    const s = await this.getOrCreate();
    const shopName = await this.currentShopName();
    return {
      shopName,
      enabled: s.foldersEnabled !== false,
      code: folderCode(s.folderCode, shopName || s.businessName),
      customCode: s.folderCode ?? '',
      materialSaleFolders: s.materialSaleFolders !== false,
      dayRoot: s.folderDayRoot ?? '',
    };
  }

  async updateFolderSettings(dto: UpdateFolderSettingsDto): Promise<FolderSettings> {
    const s = await this.getOrCreate();
    if (dto.enabled !== undefined) s.foldersEnabled = dto.enabled;
    if (dto.materialSaleFolders !== undefined) s.materialSaleFolders = dto.materialSaleFolders;
    // Kod klasör adına girer: ASCII, küçük harf, tireli (boş = dükkân adından).
    if (dto.code !== undefined) s.folderCode = nameToken(dto.code).slice(0, 20).replace(/-+$/, '');
    if (dto.dayRoot !== undefined) s.folderDayRoot = dto.dayRoot.trim();
    await this.repo.save(s);
    return this.getFolderSettings();
  }

  // ── Telegram ────────────────────────────────────────────────────────

  /** Sisteme ait tek satır; yoksa oluşturulur. */
  async getSystem(): Promise<SystemSetting> {
    const existing = await this.systemRepo.findOne({ where: {}, order: { createdAt: 'ASC' } });
    if (existing) return existing;
    return this.systemRepo.save(this.systemRepo.create({}));
  }

  /** Yalnız bot jetonu (dükkân bağlamı gerekmez: bot döngüsü, kanal denetimi). */
  async getBotToken(): Promise<string> {
    const sys = await this.getSystem();
    return sys.telegramBotToken?.trim() || this.envNotifications.telegramBotToken || '';
  }

  /**
   * Gönderim anında çağrılır (açılışta DEĞİL) → arayüzden yapılan değişiklik
   * container'ı yeniden başlatmadan hemen geçerli olur.
   * Öncelik: veritabanı → .env. Bot ve yedek sohbeti sisteme, bildirim
   * sohbeti o anki dükkâna aittir; dükkân bağlamı yoksa (yedek görevi) ilk
   * dükkânın sohbeti kullanılır. Yedek sohbeti boşsa bildirim sohbetine düşer.
   *
   * .env'deki sistem sahibi sohbeti (TELEGRAM_OWNER_CHAT_ID) YALNIZ ilk
   * (sistem sahibinin kendi) dükkânı için yedektir. Kendi sohbetini
   * tanımlamamış başka bir işletmenin bildirimleri sistem sahibinin
   * sohbetine DÜŞMEZ: aksi hâlde her işletmenin satış/ödeme/stok olayları
   * sistem sahibinin sohbetine akardı.
   */
  async getTelegram(): Promise<ResolvedTelegram> {
    const sys = await this.getSystem();
    const botToken =
      sys.telegramBotToken?.trim() || this.envNotifications.telegramBotToken || '';
    const shopId = ShopContext.shopId();
    const shopChat = shopId
      ? (await this.getOrCreate()).telegramChatId?.trim()
      : await this.firstShopChat();
    const envChat =
      !shopId || (await this.isHomeShop(shopId)) ? this.envNotifications.telegramOwnerChatId || '' : '';
    const chatId = shopChat || envChat;
    const backupChatId =
      sys.backupTelegramChatId?.trim() || this.envBackup.telegramChatId || '';
    return { botToken, chatId, backupChatId: backupChatId || chatId };
  }

  /** İlk (en eski) açık dükkân: sistem sahibinin kendi işletmesi. Kısa süre önbelleğe alınır. */
  private homeShop: { id: string; at: number } | null = null;
  private async isHomeShop(shopId: string): Promise<boolean> {
    const now = Date.now();
    if (!this.homeShop || now - this.homeShop.at > 60_000) {
      const rows: { id: string }[] = await this.repo.query(
        `SELECT "id" FROM "shops" WHERE "deleted_at" IS NULL ORDER BY "created_at" ASC LIMIT 1`,
      );
      this.homeShop = { id: rows[0]?.id ?? '', at: now };
    }
    return this.homeShop.id === shopId;
  }

  /**
   * Sistem botunun kullanıcı adı (getMe): işletmeler botu kendi grubuna bu adla
   * ekler. Jeton gösterilmez; yalnız kamuya açık kullanıcı adı döner. 10 dk önbellek.
   */
  private botName: { value: string | null; at: number } | null = null;
  async botUsername(): Promise<string | null> {
    const now = Date.now();
    if (this.botName && now - this.botName.at < 10 * 60_000) return this.botName.value;
    const token = await this.getBotToken();
    let value: string | null = null;
    if (token) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const body = (await res.json()) as { ok?: boolean; result?: { username?: string } };
        value = res.ok && body.ok ? body.result?.username ?? null : null;
      } catch {
        value = null;
      }
    }
    // Başarısızlık kısa süre saklanır (ağ yokken her istekte denenmesin).
    this.botName = { value, at: value ? now : now - 9 * 60_000 };
    return value;
  }

  /**
   * Arayüz için durum. `isOwner` false (varsayılan) → işletme görünümü: jeton,
   * yedek sohbeti, yetkili kullanıcılar, .env değerleri ve başka işletmelerin
   * adları hiç taşınmaz (bkz. TelegramStatus).
   */
  async getTelegramStatus(isOwner = false, features?: Pick<ShopFeatures, 'corel'>): Promise<TelegramStatus> {
    const sys = await this.getSystem();
    const s = await this.getOrCreate();
    const dbToken = sys.telegramBotToken?.trim() ?? '';
    const envToken = this.envNotifications.telegramBotToken ?? '';
    const token = dbToken || envToken;

    const dbChat = s.telegramChatId?.trim() ?? '';
    const resolved = await this.getTelegram();
    const botReady = !!token;
    // İşletme yalnız kendi yazdığı sohbeti görür; .env'deki sohbet sistem sahibinindir.
    const chatId = isOwner ? dbChat || (this.envNotifications.telegramOwnerChatId ?? '') : dbChat;
    const defaultChat = isOwner ? resolved.chatId : dbChat;

    const base: TelegramStatus = {
      configured: botReady && !!resolved.chatId,
      botReady,
      botUsername: await this.botUsername(),
      chatId,
      routes: [],
      ownerView: isOwner,
    };
    const { routes, chatSharedWith } = await this.routeViews(s, defaultChat, isOwner, features);
    base.routes = routes;
    if (!isOwner) return base;

    const envChat = this.envNotifications.telegramOwnerChatId ?? '';
    return {
      ...base,
      tokenSet: botReady,
      tokenMasked: this.maskToken(token),
      tokenSource: dbToken ? 'db' : envToken ? 'env' : 'none',
      chatIdSource: dbChat ? 'db' : envChat ? 'env' : 'none',
      backupChatId: sys.backupTelegramChatId?.trim() ?? '',
      effectiveBackupChatId: resolved.backupChatId,
      backupCron: this.envBackup.telegramCron,
      allowedUserIds: await this.getAllowedUserIds(),
      chatSharedWith,
    };
  }

  /**
   * Konu başına hedefler. Sistem sahibi ayrıca hangi sohbeti başka hangi
   * dükkânların kullandığını görür; işletmeye başka işletmenin adı verilmez.
   * Corel özelliği kapalı işletmede "Corel ve klasörler" konusu hiç listelenmez.
   */
  private async routeViews(
    s: AppSetting,
    defaultChat: string,
    isOwner: boolean,
    features?: Pick<ShopFeatures, 'corel'>,
  ): Promise<{ routes: TelegramRouteView[]; chatSharedWith: string[] }> {
    const others = isOwner ? await this.otherShopTargets() : [];
    const sharers = (chat: string) =>
      chat ? [...new Set(others.filter((o) => o.chats.includes(chat)).map((o) => o.name))] : [];
    const routes = NOTIFICATION_TOPICS.filter(({ key }) => key !== 'corel' || isOwner || !!features?.corel).map(
      ({ key, label, hint }) => {
        const r = (s.telegramRoutes ?? {})[key] ?? {};
        const chatId = (r.chatId ?? '').trim();
        const mode: TelegramRouteView['mode'] = r.off ? 'off' : chatId ? 'chat' : 'default';
        const effectiveChatId = mode === 'off' ? '' : chatId || defaultChat;
        return { topic: key, label, hint, mode, chatId, effectiveChatId, sharedWith: sharers(effectiveChatId) };
      },
    );
    return { routes, chatSharedWith: sharers(defaultChat) };
  }

  /** Diğer açık dükkânların adları ve bildirim gönderdikleri sohbetler (yalnız sistem sahibi görünümü). */
  private async otherShopTargets(): Promise<{ name: string; chats: string[] }[]> {
    const shopId = ShopContext.shopId();
    const rows: { shop_id: string; name: string; chat: string; routes: AppSetting['telegramRoutes'] | null }[] =
      await this.repo.query(
        `SELECT s."shop_id" AS shop_id, sh."name" AS name, s."telegram_chat_id" AS chat, s."telegram_routes" AS routes
           FROM "app_settings" s JOIN "shops" sh ON sh."id" = s."shop_id"
          WHERE s."deleted_at" IS NULL AND sh."is_active" = true AND s."shop_id" <> $1`,
        [shopId ?? '00000000-0000-0000-0000-000000000000'],
      );
    const envChat = this.envNotifications.telegramOwnerChatId || '';
    const home = rows.length ? await this.homeShopId() : '';
    return rows.map((r) => {
      const base = (r.chat ?? '').trim() || (r.shop_id === home ? envChat : '');
      const chats = new Set<string>();
      for (const { key } of NOTIFICATION_TOPICS) {
        const route = (r.routes ?? {})[key] ?? {};
        if (route.off) continue;
        const c = (route.chatId ?? '').trim() || base;
        if (c) chats.add(c);
      }
      return { name: r.name, chats: [...chats] };
    });
  }

  private async homeShopId(): Promise<string> {
    await this.isHomeShop('');
    return this.homeShop?.id ?? '';
  }

  /**
   * Bir konunun bu dükkândaki Telegram hedefi. `off`: dükkân bu konuyu
   * kapatmış. Konu yoksa (genel mesaj) bildirim sohbeti.
   */
  async telegramTarget(topic: NotificationTopic | null): Promise<{ chatId: string; off: boolean }> {
    const { chatId } = await this.getTelegram();
    if (!topic || !ShopContext.shopId()) return { chatId, off: false };
    const r = ((await this.getOrCreate()).telegramRoutes ?? {})[topic] ?? {};
    if (r.off) return { chatId: '', off: true };
    return { chatId: (r.chatId ?? '').trim() || chatId, off: false };
  }

  /** Birden çok açık dükkân varsa mesajlara dükkân adı eklenir. */
  async activeShopCount(): Promise<number> {
    const rows: { n: string }[] = await this.repo.query(
      'SELECT COUNT(*)::int AS n FROM "shops" WHERE "is_active" = true AND "deleted_at" IS NULL',
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Telegram üzerinden işlem yapmaya yetkili kullanıcı kimlikleri (sisteme
   * ait; bu kişiler botta her dükkâna erişir).
   * Boş liste = hiç kimse yetkili değil (güvenli varsayılan).
   */
  async getAllowedUserIds(): Promise<string[]> {
    const sys = await this.getSystem();
    return (sys.telegramAllowedUserIds ?? '')
      .split(/[,\s;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  /** Bir Telegram kullanıcısı işlem yapmaya yetkili mi? */
  async isUserAllowed(userId: number | string): Promise<boolean> {
    const allowed = await this.getAllowedUserIds();
    return allowed.includes(String(userId));
  }

  /**
   * Telegram ayarlarını günceller.
   *  - alan verilmediyse (undefined) DEĞİŞMEZ,
   *  - boş string gönderilirse TEMİZLENİR (→ .env değerine geri düşer).
   * Bot jetonu, yedek sohbeti ve yetkili kullanıcılar sisteme aittir:
   * yalnız sistem sahibi (`isOwner: true`) değiştirebilir. Bildirim sohbeti
   * dükkânındır.
   *
   * İşletme sohbet kimliğini yazarken kimlik biçimi denetlenir ve sistem
   * botunun o sohbette gerçekten bulunduğu (botun eklendiği bir grup/kanal)
   * Telegram'dan doğrulanır; özel (kişi) sohbetleri işletmeye kapalıdır.
   * Böylece bir işletme, başkasının kişisel sohbetine bot adıyla mesaj
   * gönderemez.
   */
  async updateTelegram(
    dto: UpdateTelegramDto,
    isOwner: boolean,
    features?: Pick<ShopFeatures, 'corel'>,
  ): Promise<TelegramStatus> {
    const touchesSystem =
      dto.telegramBotToken !== undefined ||
      dto.backupTelegramChatId !== undefined ||
      dto.telegramAllowedUserIds !== undefined;
    if (touchesSystem && !isOwner) {
      throw new ForbiddenException(
        'Bot jetonu, yedek sohbeti ve yetkili kullanıcıları yalnız sistem sahibi değiştirebilir.',
      );
    }
    if (dto.telegramChatId !== undefined || dto.telegramRoutes !== undefined) {
      const s = await this.getOrCreate();
      const nextRoutes = dto.telegramRoutes !== undefined ? cleanRoutes(dto.telegramRoutes) : undefined;
      const nextChat = dto.telegramChatId !== undefined ? dto.telegramChatId.trim() : undefined;

      // Yeni/değişen sohbet kimlikleri (boşaltmak serbest).
      const wanted = new Set<string>();
      if (nextChat && nextChat !== (s.telegramChatId ?? '').trim()) wanted.add(nextChat);
      for (const r of Object.values(nextRoutes ?? {})) {
        if (r.chatId) wanted.add(r.chatId);
      }
      for (const id of wanted) {
        if (!CHAT_ID_RE.test(id)) {
          throw new BadRequestException(`"${id}" geçerli bir Telegram sohbet kimliği değil (örn. -1001234567890).`);
        }
      }
      if (!isOwner) {
        const known = new Set<string>([
          (s.telegramChatId ?? '').trim(),
          ...Object.values(s.telegramRoutes ?? {}).map((r) => (r.chatId ?? '').trim()),
        ]);
        for (const id of wanted) {
          if (!known.has(id)) await this.assertGroupChat(id);
        }
      }

      if (nextChat !== undefined) s.telegramChatId = nextChat;
      if (nextRoutes !== undefined) {
        // Corel özelliği kapalı işletme Corel konusunun hedefini yazamaz/değiştiremez.
        if (!isOwner && !features?.corel) {
          const keep = (s.telegramRoutes ?? {}).corel;
          delete nextRoutes.corel;
          if (keep) nextRoutes.corel = keep;
        }
        s.telegramRoutes = nextRoutes;
      }
      await this.repo.save(s);
    }
    if (touchesSystem) {
      const sys = await this.getSystem();
      if (dto.telegramBotToken !== undefined) {
        sys.telegramBotToken = dto.telegramBotToken.trim();
        this.botName = null;
      }
      if (dto.backupTelegramChatId !== undefined) {
        sys.backupTelegramChatId = dto.backupTelegramChatId.trim();
      }
      if (dto.telegramAllowedUserIds !== undefined) {
        // Serbest girilen listeyi tekilleştirip normalize et.
        const ids = [
          ...new Set(
            dto.telegramAllowedUserIds
              .split(/[,\s;]+/)
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ];
        sys.telegramAllowedUserIds = ids.join(',');
      }
      await this.systemRepo.save(sys);
    }
    return this.getTelegramStatus(isOwner, features);
  }

  /**
   * Bir işletmenin yazdığı sohbet kimliği gerçekten sistem botunun bulunduğu bir
   * grup/kanal mı? Telegram `getChat` ile doğrulanır; kişisel sohbet reddedilir.
   * Sınanabilmesi için ayrı bir metottur.
   */
  protected async assertGroupChat(chatId: string): Promise<void> {
    const token = await this.getBotToken();
    if (!token) {
      throw new BadRequestException(
        'Telegram botu henüz hazır değil; sistem yöneticisi bot jetonunu tanımlamalıdır.',
      );
    }
    type ChatInfo = { ok?: boolean; result?: { type?: string } };
    let info: ChatInfo | null = null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId }),
      });
      info = (await res.json()) as ChatInfo;
    } catch {
      throw new BadRequestException('Telegram\'a ulaşılamadı; biraz sonra yeniden deneyin.');
    }
    if (!info?.ok) {
      throw new BadRequestException(
        'Bot bu sohbette değil ya da kimlik yanlış. Önce botu grubunuza ekleyin, sonra grupta /idx yazıp çıkan kimliği kullanın.',
      );
    }
    if (info.result?.type === 'private') {
      throw new BadRequestException('Bildirimler kişisel sohbete değil, botu eklediğiniz bir gruba/kanala gönderilir.');
    }
  }

  /**
   * Dükkân bağlamı olmadan (yedek görevi): ilk (sistem sahibinin kendi)
   * dükkânın bildirim sohbeti. Yalnız İLK dükkândır — o sohbet tanımsızsa başka
   * bir işletmenin sohbeti aranmaz: bütün veritabanının yedeği bir işletmenin
   * grubuna gidemez.
   */
  private async firstShopChat(): Promise<string> {
    const rows: { telegram_chat_id: string }[] = await this.repo.query(
      `SELECT s."telegram_chat_id" FROM "app_settings" s
        WHERE s."deleted_at" IS NULL
          AND s."shop_id" = (SELECT "id" FROM "shops" WHERE "deleted_at" IS NULL AND "is_active" = true
                              ORDER BY "created_at" ASC LIMIT 1)
        LIMIT 1`,
    );
    return rows[0]?.telegram_chat_id?.trim() ?? '';
  }

  /**
   * Jetonu tanınabilir ama kullanılamaz biçimde gösterir.
   * Telegram jetonu "<botId>:<gizli>" yapısındadır; bot id'si gizli değildir.
   */
  private maskToken(token: string): string {
    if (!token) return '';
    const [botId, secret] = token.split(':');
    if (!secret) return `${token.slice(0, 2)}••••`;
    return `${botId}:••••${secret.slice(-4)}`;
  }
}

/**
 * Arayüzden gelen konu hedeflerini süzer: yalnız bilinen konular, sohbet
 * kimliği metin (en çok 64), kapalı olan işaretlenir. Varsayılana dönen
 * konu hiç yazılmaz.
 */
export function cleanRoutes(
  input: Record<string, { chatId?: unknown; off?: unknown }> | null | undefined,
): Record<string, { chatId?: string; off?: boolean }> {
  const out: Record<string, { chatId?: string; off?: boolean }> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!isTopic(key) || !value || typeof value !== 'object') continue;
    if (value.off === true) {
      out[key] = { off: true };
      continue;
    }
    const chatId = typeof value.chatId === 'string' ? value.chatId.trim().slice(0, 64) : '';
    if (chatId) out[key] = { chatId };
  }
  return out;
}
