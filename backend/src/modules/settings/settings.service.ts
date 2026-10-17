import { randomBytes, timingSafeEqual } from 'crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BackupConfig,
  BusinessConfig,
  NotificationsConfig,
} from '../../config/configuration';
import { ShopContext } from '../../common/shop/shop-context';
import { AppSetting } from './entities/app-setting.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateTelegramDto } from './dto/update-telegram.dto';

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

/** Ayar değerinin nereden geldiği — arayüzde gösterilir. */
export type SettingSource = 'db' | 'env' | 'none';

/**
 * Arayüze dönen Telegram durumu. Jeton ASLA açık gönderilmez; yalnızca
 * tanımlı olup olmadığı ve maskelenmiş bir önizleme paylaşılır.
 */
export interface TelegramStatus {
  configured: boolean;
  tokenSet: boolean;
  tokenMasked: string;
  tokenSource: SettingSource;
  chatId: string;
  chatIdSource: SettingSource;
  backupChatId: string;
  /** Yedeğin gerçekte gideceği sohbet (backupChatId boşsa chatId). */
  effectiveBackupChatId: string;
  backupCron: string;
  /** Telegram'dan işlem yapabilecek kullanıcı kimlikleri. */
  allowedUserIds: string[];
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

  async update(dto: UpdateBusinessDto): Promise<AppSetting> {
    const s = await this.getOrCreate();
    Object.assign(s, dto);
    return this.repo.save(s);
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
   */
  async getTelegram(): Promise<ResolvedTelegram> {
    const sys = await this.getSystem();
    const botToken =
      sys.telegramBotToken?.trim() || this.envNotifications.telegramBotToken || '';
    const shopChat = ShopContext.shopId()
      ? (await this.getOrCreate()).telegramChatId?.trim()
      : await this.firstShopChat();
    const chatId = shopChat || this.envNotifications.telegramOwnerChatId || '';
    const backupChatId =
      sys.backupTelegramChatId?.trim() || this.envBackup.telegramChatId || '';
    return { botToken, chatId, backupChatId: backupChatId || chatId };
  }

  /** Arayüz için durum — jeton maskelenir, asla açık dönmez. */
  async getTelegramStatus(): Promise<TelegramStatus> {
    const sys = await this.getSystem();
    const s = await this.getOrCreate();
    const dbToken = sys.telegramBotToken?.trim() ?? '';
    const envToken = this.envNotifications.telegramBotToken ?? '';
    const token = dbToken || envToken;

    const dbChat = s.telegramChatId?.trim() ?? '';
    const envChat = this.envNotifications.telegramOwnerChatId ?? '';
    const chatId = dbChat || envChat;

    const backupChatId = sys.backupTelegramChatId?.trim() ?? '';
    const resolved = await this.getTelegram();

    return {
      configured: !!token && !!resolved.chatId,
      tokenSet: !!token,
      tokenMasked: this.maskToken(token),
      tokenSource: dbToken ? 'db' : envToken ? 'env' : 'none',
      chatId,
      chatIdSource: dbChat ? 'db' : envChat ? 'env' : 'none',
      backupChatId,
      effectiveBackupChatId: resolved.backupChatId,
      backupCron: this.envBackup.telegramCron,
      allowedUserIds: await this.getAllowedUserIds(),
    };
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
   * yalnız sistem sahibi (`system: true`) değiştirebilir. Bildirim sohbeti
   * dükkânındır.
   */
  async updateTelegram(dto: UpdateTelegramDto, system: boolean): Promise<TelegramStatus> {
    const touchesSystem =
      dto.telegramBotToken !== undefined ||
      dto.backupTelegramChatId !== undefined ||
      dto.telegramAllowedUserIds !== undefined;
    if (touchesSystem && !system) {
      throw new ForbiddenException(
        'Bot jetonu, yedek sohbeti ve yetkili kullanıcıları yalnız sistem sahibi değiştirebilir.',
      );
    }
    if (dto.telegramChatId !== undefined) {
      const s = await this.getOrCreate();
      s.telegramChatId = dto.telegramChatId.trim();
      await this.repo.save(s);
    }
    if (touchesSystem) {
      const sys = await this.getSystem();
      if (dto.telegramBotToken !== undefined) {
        sys.telegramBotToken = dto.telegramBotToken.trim();
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
    return this.getTelegramStatus();
  }

  /** Dükkân bağlamı olmadan (yedek görevi): ilk açık dükkânın bildirim sohbeti. */
  private async firstShopChat(): Promise<string> {
    const rows: { telegram_chat_id: string }[] = await this.repo.query(
      `SELECT s."telegram_chat_id" FROM "app_settings" s
         JOIN "shops" sh ON sh."id" = s."shop_id"
        WHERE s."deleted_at" IS NULL AND sh."is_active" = true AND s."telegram_chat_id" <> ''
        ORDER BY sh."created_at" ASC LIMIT 1`,
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
