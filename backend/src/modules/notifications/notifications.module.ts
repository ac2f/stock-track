import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { LogChannel } from './channels/log.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { NotificationListeners } from './listeners/notification.listeners';
import { DebtReminderScheduler } from './schedulers/debt-reminder.scheduler';

/**
 * Bildirim & hatırlatma. Olay (event-emitter) dinleyicileri ve zamanlanmış
 * görevlerle çalışır; kanallar Log (daima) ve Telegram (config-gated).
 * Customer salt-okunur olarak alıcı (telegramChatId) çözümü için kaydedilir.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Notification, Customer])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    LogChannel,
    TelegramChannel,
    WhatsappChannel,
    NotificationListeners,
    DebtReminderScheduler,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
