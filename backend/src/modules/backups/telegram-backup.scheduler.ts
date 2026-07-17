import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramBackupService } from './telegram-backup.service';

/**
 * Saatlik (varsayılan) şifreli yedek → Telegram gönderimi. Aynı gün içinde tek
 * mesaj olacak şekilde ilerler (bkz. TelegramBackupService). SCHEDULER_ENABLED
 * false ise veya Telegram yapılandırılmamışsa çalışmaz. Başarısızlıkta owner'a
 * bildirim düşer (bildirim geçmişinde görünür).
 */
@Injectable()
export class TelegramBackupScheduler {
  private readonly logger = new Logger(TelegramBackupScheduler.name);
  private readonly enabled: boolean;
  private readonly ownerChatId: string;

  constructor(
    private readonly telegramBackups: TelegramBackupService,
    private readonly notifications: NotificationsService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('scheduler.enabled') ?? true;
    this.ownerChatId =
      configService.get<string>('notifications.telegramOwnerChatId') ?? '';
  }

  @Cron(process.env.BACKUP_TELEGRAM_CRON || '0 * * * *')
  async handle(): Promise<void> {
    if (!this.enabled || !this.telegramBackups.isConfigured()) {
      return;
    }
    try {
      const res = await this.telegramBackups.runAndSend('auto');
      this.logger.log(
        `Şifreli yedek Telegram'a ${res.action === 'created' ? 'gönderildi' : 'güncellendi'}: ` +
          `${res.fileName} (gün ${res.dayKey}, ${res.entryCount}. yedek).`,
      );
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Otomatik şifreli yedek gönderilemedi: ${message}`);
      await this.notifications.notify({
        type: NotificationType.BACKUP,
        subject: 'Şifreli yedek Telegram gönderimi BAŞARISIZ',
        body: `Otomatik şifreli veritabanı yedeği Telegram'a gönderilemedi: ${message}`,
        telegramChatId: this.ownerChatId || undefined,
        relatedType: 'backup',
      });
    }
  }
}
