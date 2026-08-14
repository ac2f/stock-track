import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { SettingsModule } from '../settings/settings.module';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { LogChannel } from './channels/log.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { NotificationListeners } from './listeners/notification.listeners';
import { DebtReminderScheduler } from './schedulers/debt-reminder.scheduler';
import { TelegramCommandsService } from './telegram-commands.service';

/**
 * Bildirim & hatırlatma. Olay (event-emitter) dinleyicileri ve zamanlanmış
 * görevlerle çalışır; kanallar Log (daima) ve Telegram (config-gated).
 * Customer salt-okunur olarak alıcı (telegramChatId) çözümü için kaydedilir.
 */
@Module({
  // SettingsModule: Telegram jetonu/sohbeti gönderim anında ayarlardan okunur.
  imports: [TypeOrmModule.forFeature([Notification, Customer]), SettingsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    LogChannel,
    TelegramChannel,
    WhatsappChannel,
    NotificationListeners,
    DebtReminderScheduler,
    // Gruba /idx yazıldığında sohbet kimliğini cevaplar.
    TelegramCommandsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
