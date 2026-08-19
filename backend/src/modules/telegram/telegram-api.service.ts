import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

/** Satır satır düğme dizilimi (inline keyboard). */
export type Keyboard = { text: string; data: string }[][];

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string; title?: string; username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; first_name?: string; username?: string };
    message?: {
      message_id: number;
      chat: { id: number; type: string; title?: string };
    };
  };
}

/**
 * Telegram Bot API'sinin ince sarmalayıcısı.
 *
 * Jeton her çağrıda ayarlardan okunur (arayüzden değiştirilince yeniden
 * başlatmaya gerek kalmaz). Ağ hataları çağırana fırlatılır; bot döngüsü
 * bunları yutup çalışmaya devam eder.
 */
@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);

  constructor(private readonly settings: SettingsService) {}

  async token(): Promise<string> {
    return (await this.settings.getTelegram()).botToken;
  }

  /** Inline düğme dizilimini Telegram'ın beklediği yapıya çevirir. */
  private markup(keyboard?: Keyboard) {
    if (!keyboard?.length) return undefined;
    return {
      inline_keyboard: keyboard.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.data })),
      ),
    };
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    keyboard?: Keyboard,
  ): Promise<number | null> {
    const json = await this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: this.markup(keyboard),
    });
    return (json?.result as { message_id?: number })?.message_id ?? null;
  }

  /**
   * Mevcut mesajı yerinde günceller — menüde gezinirken sohbet yeni mesajlarla
   * dolmaz. Mesaj düzenlenemezse (çok eski/silinmiş) yenisi gönderilir.
   */
  async editMessage(
    chatId: number | string,
    messageId: number,
    text: string,
    keyboard?: Keyboard,
  ): Promise<void> {
    try {
      await this.call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: this.markup(keyboard),
      });
    } catch (err) {
      const message = (err as Error).message;
      // "message is not modified" zararsızdır; diğer hatalarda yeni mesaj at.
      if (message.includes('not modified')) return;
      await this.sendMessage(chatId, text, keyboard);
    }
  }

  /** Düğmeye basıldığında Telegram'ın beklediği onay (saat ikonu kaybolur). */
  async answerCallback(callbackId: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackId,
      ...(text ? { text } : {}),
    }).catch(() => undefined);
  }

  async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    const json = await this.call('getUpdates', {
      timeout: 0,
      offset,
      allowed_updates: ['message', 'callback_query'],
    });
    return (json?.result as TelegramUpdate[]) ?? [];
  }

  /** Jetonu doğrular (getMe) — "yeniden başlat" düğmesi bunu kullanır. */
  async getMe(): Promise<{ username?: string; first_name?: string }> {
    const json = await this.call('getMe', {});
    return (json?.result as { username?: string; first_name?: string }) ?? {};
  }

  private async call(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; result?: unknown } | null> {
    const botToken = await this.token();
    if (!botToken) return null;
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: unknown;
    };
    if (!res.ok || !json.ok) {
      throw new Error(
        `Telegram ${method} ${res.status}: ${json.description ?? 'bilinmeyen hata'}`,
      );
    }
    return json;
  }

  /** HTML parse_mode için kullanıcı metnini güvenli hale getirir. */
  static escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  warn(message: string): void {
    this.logger.warn(message);
  }
}
