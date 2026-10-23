import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { NotificationChannel } from '../enums/notification.enums';
import {
  ChannelResult,
  NotificationChannelPort,
  OutboundMessage,
} from './notification-channel.interface';
import { isReplicaRole, REPLICA_SILENT_MESSAGE } from '../../sync/sync-role';
import { ShopContext } from '../../../common/shop/shop-context';
import { NotificationTopic } from '../enums/notification-topic';

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
    return !!(await this.settings.getBotToken());
  }

  /** Açık hedefi olmayan mesajda dükkân bu konuyu kapatmışsa gönderilmez. */
  async accepts(message: OutboundMessage): Promise<boolean> {
    if (message.telegramChatId || message.recipient) return true;
    return !(await this.settings.telegramTarget(message.topic ?? null)).off;
  }

  async send(message: OutboundMessage): Promise<ChannelResult> {
    if (isReplicaRole()) return { success: false, error: REPLICA_SILENT_MESSAGE };
    const botToken = await this.settings.getBotToken();
    // Açık hedef (müşterinin sohbeti, yedek sohbeti) yoksa dükkânın o
    // konuya seçtiği sohbet; dükkânlar sohbet paylaşabildiği için mesaja
    // dükkân adı eklenir.
    const explicit = message.telegramChatId || message.recipient;
    let chatId = explicit;
    let shopLine = '';
    if (!explicit) {
      const target = await this.settings.telegramTarget(message.topic ?? null);
      if (target.off) return { success: false, error: 'Bu konu dükkânda kapalı.' };
      chatId = target.chatId;
      shopLine = await this.shopLine();
    }
    if (!botToken || !chatId) {
      return { success: false, error: 'Telegram token veya chat id tanımlı değil.' };
    }
    const text =
      shopLine +
      (message.subject ? `*${message.subject}*\n${message.body}` : message.body);
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
   * Birden çok açık dükkân varsa mesajın ilk satırı dükkân adı: aynı
   * sohbete iki dükkân bildirim gönderebilir.
   */
  private async shopLine(): Promise<string> {
    if (!ShopContext.shopId() || (await this.settings.activeShopCount()) < 2) return '';
    const name = await this.settings.currentShopName();
    return name ? `🏪 ${TelegramChannel.escapeMarkdown(name)}\n` : '';
  }

  /** Telegram'ın eski Markdown biçiminde özel karakterleri kaçırır. */
  static escapeMarkdown(s: string): string {
    return s.replace(/([_*`\[])/g, '\\$1');
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

  /**
   * Ayarlardaki sohbete (konu verilirse o konunun sohbetine) deneme mesajı
   * gönderir; bağlantıyı ve yönlendirmeyi uçtan uca sınar.
   */
  async sendTest(topic?: NotificationTopic | null): Promise<ChannelResult & { chatId: string }> {
    const target = await this.settings.telegramTarget(topic ?? null);
    if (target.off) return { success: false, error: 'Bu konu kapalı.', chatId: '' };
    const result = await this.send({
      subject: 'StockTrack test mesajı',
      body: `Telegram bağlantısı çalışıyor. Bu mesaj ${target.chatId} sohbetine gönderildi.`,
      topic: topic ?? null,
    });
    return { ...result, chatId: target.chatId };
  }
}
