import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { BackupScheduler } from './backup.scheduler';

/**
 * Veritabanı yedekleme/geri yükleme. Elle indirme/geri yükleme uçları (owner) +
 * zamanlı otomatik yedek + sahibe bildirim (bildirim geçmişinde görünür).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BackupsController],
  providers: [BackupsService, BackupScheduler],
  exports: [BackupsService],
})
export class BackupsModule {}
