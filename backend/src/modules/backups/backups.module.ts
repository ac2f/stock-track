import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { BackupScheduler } from './backup.scheduler';
import { BackupCryptoService } from './backup-crypto.service';
import { TelegramBackupService } from './telegram-backup.service';
import { TelegramBackupScheduler } from './telegram-backup.scheduler';

/**
 * Veritabanı yedekleme/geri yükleme. Elle indirme/geri yükleme uçları (owner) +
 * zamanlı otomatik disk yedeği + saatlik şifreli yedeğin Telegram'a gönderimi
 * (aynı gün tek mesaj, sabitlenir) + sahibe bildirim (bildirim geçmişinde görünür).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BackupsController],
  providers: [
    BackupsService,
    BackupScheduler,
    BackupCryptoService,
    TelegramBackupService,
    TelegramBackupScheduler,
  ],
  exports: [BackupsService],
})
export class BackupsModule {}
