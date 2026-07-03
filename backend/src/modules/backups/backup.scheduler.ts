import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { BackupsService } from './backups.service';

/**
 * Zamanlı (varsayılan: her gün 03:00) otomatik veritabanı yedeği. Yedek diske
 * yazılır ve sonuç (başarı/başarısızlık) işletme sahibine BİLDİRİM olarak düşer
 * → bildirim geçmişinde (log kanalı) görünür. SCHEDULER_ENABLED=false ise çalışmaz.
 */
@Injectable()
export class BackupScheduler {
  private readonly logger = new Logger(BackupScheduler.name);
  private readonly enabled: boolean;
  private readonly ownerChatId: string;

  constructor(
    private readonly backups: BackupsService,
    private readonly notifications: NotificationsService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('scheduler.enabled') ?? true;
    this.ownerChatId =
      configService.get<string>('notifications.telegramOwnerChatId') ?? '';
  }

  @Cron(process.env.BACKUP_CRON || '0 3 * * *')
  async handle(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const created = await this.backups.createBackup(true);
      const kb = Math.max(1, Math.round(created.size / 1024));
      this.logger.log(`Otomatik yedek alındı: ${created.fileName} (${kb} KB)`);
      await this.notifications.notify({
        type: NotificationType.BACKUP,
        subject: 'Veritabanı yedeği alındı',
        body:
          `Otomatik veritabanı yedeği başarıyla alındı: ${created.fileName} ` +
          `(${kb} KB).`,
        telegramChatId: this.ownerChatId || undefined,
        relatedType: 'backup',
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Otomatik yedek başarısız: ${message}`);
      await this.notifications.notify({
        type: NotificationType.BACKUP,
        subject: 'Veritabanı yedeği BAŞARISIZ',
        body: `Otomatik veritabanı yedeği alınamadı: ${message}`,
        telegramChatId: this.ownerChatId || undefined,
        relatedType: 'backup',
      });
    }
  }
}
