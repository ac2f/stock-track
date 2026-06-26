import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '../enums/notification.enums';
import {
  ChannelResult,
  NotificationChannelPort,
  OutboundMessage,
} from './notification-channel.interface';

/**
 * Telegram bot kanalı. Bot API'sine basit bir HTTPS çağrısı yapar.
 * TELEGRAM_BOT_TOKEN tanımlı değilse kanal pasiftir (yalnızca Log çalışır).
 * Ağ/erişim yoksa hata toleranslıdır → iş akışını bozmaz.
 */
@Injectable()
export class TelegramChannel implements NotificationChannelPort {
  readonly channel = NotificationChannel.TELEGRAM;
  private readonly logger = new Logger(TelegramChannel.name);
  private readonly botToken: string;
  private readonly defaultChatId: string;

  constructor(configService: ConfigService) {
    this.botToken =
      configService.get<string>('notifications.telegramBotToken') ?? '';
    this.defaultChatId =
      configService.get<string>('notifications.telegramOwnerChatId') ?? '';
  }

  isEnabled(): boolean {
    return !!this.botToken;
  }

  async send(message: OutboundMessage): Promise<ChannelResult> {
    const chatId = message.recipient || this.defaultChatId;
    if (!this.botToken || !chatId) {
      return { success: false, error: 'Telegram token veya chat id tanımlı değil.' };
    }
    const text = message.subject
      ? `*${message.subject}*\n${message.body}`
      : message.body;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Telegram ${res.status}: ${body}` };
      }
      return { success: true };
    } catch (err) {
      this.logger.warn(`Telegram gönderimi başarısız: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }
}
