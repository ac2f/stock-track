import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { NotificationChannel } from '../enums/notification.enums';
import {
  ChannelResult,
  NotificationChannelPort,
  OutboundMessage,
} from './notification-channel.interface';

/** "Yeniden başlat" düğmesinin döndürdüğü bağlantı durumu. */
export interface TelegramVerifyResult {
  ok: boolean;
  /** Bot kullanıcı adı (@olmadan) — jeton geçerliyse gelir. */
  botUsername?: string;
  botName?: string;
  chatId: string;
  backupChatId: string;
  error?: string;
}

/**
 * Telegram bot kanalı. Bot API'sine basit bir HTTPS çağrısı yapar.
 *
 * Jeton ve sohbet kimliği HER GÖNDERİMDE ayarlardan okunur (açılışta bir kez
 * değil) → arayüzden değiştirilince container'ı yeniden başlatmaya gerek
 * kalmaz. Ayar boşsa .env değerine düşülür; ikisi de yoksa kanal pasiftir.
 * Ağ/erişim yoksa hata toleranslıdır → iş akışını bozmaz.
 */
@Injectable()
export class TelegramChannel implements NotificationChannelPort {
  readonly channel = NotificationChannel.TELEGRAM;
  private readonly logger = new Logger(TelegramChannel.name);

  constructor(private readonly settings: SettingsService) {}

  async isEnabled(): Promise<boolean> {
    const { botToken } = await this.settings.getTelegram();
    return !!botToken;
  }

  async send(message: OutboundMessage): Promise<ChannelResult> {
    const { botToken, chatId: defaultChatId } =
      await this.settings.getTelegram();
    const chatId =
      message.telegramChatId || message.recipient || defaultChatId;
    if (!botToken || !chatId) {
      return { success: false, error: 'Telegram token veya chat id tanımlı değil.' };
    }
    const text = message.subject
      ? `*${message.subject}*\n${message.body}`
      : message.body;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
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

  /**
   * Ayarları yeniden okur ve jetonu Telegram'a `getMe` ile doğrular —
   * arayüzdeki "Yeniden başlat" düğmesinin karşılığı. Hangi sohbete mesaj
   * gideceğini de döndürür.
   */
  async verify(): Promise<TelegramVerifyResult> {
    const { botToken, chatId, backupChatId } = await this.settings.getTelegram();
    if (!botToken) {
      return {
        ok: false,
        chatId,
        backupChatId,
        error: 'Bot jetonu tanımlı değil.',
      };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const body = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: { username?: string; first_name?: string };
      };
      if (!res.ok || !body.ok) {
        return {
          ok: false,
          chatId,
          backupChatId,
          error: body.description ?? `Telegram ${res.status}`,
        };
      }
      return {
        ok: true,
        botUsername: body.result?.username,
        botName: body.result?.first_name,
        chatId,
        backupChatId,
      };
    } catch (err) {
      return {
        ok: false,
        chatId,
        backupChatId,
        error: (err as Error).message,
      };
    }
  }

  /** Ayarlardaki sohbete deneme mesajı gönderir (bağlantıyı uçtan uca sınar). */
  async sendTest(): Promise<ChannelResult & { chatId: string }> {
    const { chatId } = await this.settings.getTelegram();
    const result = await this.send({
      subject: 'StockTrack test mesajı',
      body: `Telegram bağlantısı çalışıyor. Bu mesaj ${chatId} sohbetine gönderildi.`,
      telegramChatId: chatId,
    });
    return { ...result, chatId };
  }
}
