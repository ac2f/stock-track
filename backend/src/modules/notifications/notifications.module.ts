import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { StockLevel } from '../materials/entities/stock-level.entity';
import { ProcessingJob } from '../processing/entities/processing-job.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { SettingsModule } from '../settings/settings.module';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { LogChannel } from './channels/log.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { NotificationListeners } from './listeners/notification.listeners';
import { DebtReminderScheduler } from './schedulers/debt-reminder.scheduler';
import { MorningSummaryService } from './morning-summary.service';

/**
 * Bildirim & hatırlatma. Olay (event-emitter) dinleyicileri ve zamanlanmış
 * görevlerle çalışır; kanallar Log (daima) ve Telegram (config-gated).
 * Customer salt-okunur olarak alıcı (telegramChatId) çözümü için kaydedilir.
 */
@Module({
  // SettingsModule: Telegram jetonu/sohbeti gönderim anında ayarlardan okunur.
  // Sabah özeti işleri, plakaları, stoğu ve teklifleri salt-okunur okur.
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      Customer,
      ProcessingJob,
      MaterialPlate,
      StockLevel,
      Quote,
    ]),
    SettingsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    LogChannel,
    TelegramChannel,
    WhatsappChannel,
    NotificationListeners,
    DebtReminderScheduler,
    MorningSummaryService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
