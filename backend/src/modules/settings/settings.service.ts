import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BackupConfig,
  BusinessConfig,
  NotificationsConfig,
} from '../../config/configuration';
import { AppSetting } from './entities/app-setting.entity';
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
}

/**
 * Çalışma-zamanı ayarları. Tek satır tutulur; ilk erişimde .env (BusinessConfig)
 * varsayılanlarından tohumlanır. Belge servisleri ve portal, işletme kimliğini
 * BURADAN okur — böylece ad/adres tek ekrandan düzenlenebilir.
 */
@Injectable()
export class SettingsService {
  private readonly business: BusinessConfig;
  private readonly envNotifications: NotificationsConfig;
  private readonly envBackup: BackupConfig;

  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
    configService: ConfigService,
  ) {
    this.business = configService.get<BusinessConfig>('business')!;
    this.envNotifications = configService.get<NotificationsConfig>('notifications')!;
    this.envBackup = configService.get<BackupConfig>('backup')!;
  }

  /** Tek ayar satırını döndürür; yoksa .env varsayılanlarıyla oluşturur. */
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

  // ── Telegram ────────────────────────────────────────────────────────

  /**
   * Gönderim anında çağrılır (açılışta DEĞİL) → arayüzden yapılan değişiklik
   * container'ı yeniden başlatmadan hemen geçerli olur.
   * Öncelik: veritabanı → .env. Yedek sohbeti boşsa bildirim sohbetine düşer.
   */
  async getTelegram(): Promise<ResolvedTelegram> {
    const s = await this.getOrCreate();
    const botToken =
      s.telegramBotToken?.trim() || this.envNotifications.telegramBotToken || '';
    const chatId =
      s.telegramChatId?.trim() ||
      this.envNotifications.telegramOwnerChatId ||
      '';
    const backupChatId =
      s.backupTelegramChatId?.trim() || this.envBackup.telegramChatId || '';
    return { botToken, chatId, backupChatId: backupChatId || chatId };
  }

  /** Arayüz için durum — jeton maskelenir, asla açık dönmez. */
  async getTelegramStatus(): Promise<TelegramStatus> {
    const s = await this.getOrCreate();
    const dbToken = s.telegramBotToken?.trim() ?? '';
    const envToken = this.envNotifications.telegramBotToken ?? '';
    const token = dbToken || envToken;

    const dbChat = s.telegramChatId?.trim() ?? '';
    const envChat = this.envNotifications.telegramOwnerChatId ?? '';
    const chatId = dbChat || envChat;

    const backupChatId = s.backupTelegramChatId?.trim() ?? '';
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
    };
  }

  /**
   * Telegram ayarlarını günceller.
   *  - alan verilmediyse (undefined) DEĞİŞMEZ,
   *  - boş string gönderilirse TEMİZLENİR (→ .env değerine geri düşer).
   */
  async updateTelegram(dto: UpdateTelegramDto): Promise<TelegramStatus> {
    const s = await this.getOrCreate();
    if (dto.telegramBotToken !== undefined) {
      s.telegramBotToken = dto.telegramBotToken.trim();
    }
    if (dto.telegramChatId !== undefined) {
      s.telegramChatId = dto.telegramChatId.trim();
    }
    if (dto.backupTelegramChatId !== undefined) {
      s.backupTelegramChatId = dto.backupTelegramChatId.trim();
    }
    await this.repo.save(s);
    return this.getTelegramStatus();
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
