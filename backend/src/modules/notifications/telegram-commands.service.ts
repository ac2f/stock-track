import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { SettingsService } from '../settings/settings.service';

/** Telegram getUpdates yanıtından ihtiyacımız olan alanlar. */
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string; title?: string; username?: string };
  };
}

/** Sohbet kimliğini soran komut: /idx veya /idx@BotAdi */
const IDX_COMMAND = /^\/idx(@[\w_]+)?\s*$/i;

/** Kaç ms'de bir yeni mesaj sorulur. */
const POLL_MS = 5000;

/**
 * Telegram komut dinleyicisi.
 *
 * Tek işi var: bir gruba (veya özel sohbete) "/idx" yazıldığında o sohbetin
 * kimliğini aynı sohbete cevap olarak yazar. Mobil uygulamada sohbet kimliğini
 * bulmak zor olduğu için ayarlara yapıştırılacak değeri doğrudan verir.
 *
 * Uzun bağlantı (webhook) kurmaya gerek kalmadan getUpdates ile kısa aralıklı
 * yoklama yapar. Açılışta bekleyen eski mesajlar CEVAPLANMAZ (yalnızca imleç
 * ileri alınır) → sunucu yeniden başladığında eski komutlara yanıt yağmaz.
 */
@Injectable()
export class TelegramCommandsService {
  private readonly logger = new Logger(TelegramCommandsService.name);
  private readonly enabled: boolean;
  /** Bir sonraki istenecek update_id; null → henüz imleç kurulmadı. */
  private offset: number | null = null;
  private polling = false;
  /** getUpdates başka bir tüketiciyle çakışıyorsa (webhook) sürekli loglama. */
  private conflictLogged = false;

  constructor(
    private readonly settings: SettingsService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('scheduler.enabled') ?? true;
  }

  @Interval(POLL_MS)
  async poll(): Promise<void> {
    if (!this.enabled || this.polling) return;
    const { botToken } = await this.settings.getTelegram();
    if (!botToken) return;

    this.polling = true;
    try {
      // İlk turda yalnızca imleci kur: son mesajı al, cevaplama.
      if (this.offset === null) {
        const last = await this.getUpdates(botToken, -1);
        this.offset = last.length ? last[last.length - 1].update_id + 1 : 0;
        return;
      }

      const updates = await this.getUpdates(botToken, this.offset);
      for (const update of updates) {
        this.offset = update.update_id + 1;
        const text = update.message?.text?.trim();
        if (!text || !IDX_COMMAND.test(text)) continue;
        await this.replyWithChatId(botToken, update).catch((err) =>
          this.logger.warn(`/idx yanıtlanamadı: ${(err as Error).message}`),
        );
      }
    } catch (err) {
      const message = (err as Error).message;
      // 409: sohbet güncellemelerini başka bir tüketici (webhook) alıyor.
      if (message.includes('409')) {
        if (!this.conflictLogged) {
          this.logger.warn(
            `Telegram güncellemeleri okunamıyor (başka bir tüketici/webhook etkin): ${message}`,
          );
          this.conflictLogged = true;
        }
      } else {
        this.logger.debug(`Telegram getUpdates başarısız: ${message}`);
      }
    } finally {
      this.polling = false;
    }
  }

  /** Sohbet kimliğini, mobilde dokunarak kopyalanabilecek biçimde yazar. */
  private async replyWithChatId(
    botToken: string,
    update: TelegramUpdate,
  ): Promise<void> {
    const chat = update.message!.chat;
    const isGroup = chat.type !== 'private';
    const name = chat.title ?? chat.username ?? 'bu sohbet';
    const text =
      `🆔 *${this.escape(name)}*\n` +
      `${isGroup ? 'Grup' : 'Sohbet'} kimliği:\n` +
      `\`${chat.id}\`\n\n` +
      'Kimliğe dokunarak kopyalayın, sonra uygulamada ' +
      '_Ayarlar › Telegram_ ekranındaki sohbet kimliği alanına yapıştırın.';

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat.id,
          text,
          parse_mode: 'Markdown',
          reply_to_message_id: update.message!.message_id,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Telegram sendMessage ${res.status}: ${await res.text()}`);
    }
  }

  private async getUpdates(
    botToken: string,
    offset: number,
  ): Promise<TelegramUpdate[]> {
    const url =
      `https://api.telegram.org/bot${botToken}/getUpdates` +
      `?timeout=0&offset=${offset}&allowed_updates=${encodeURIComponent('["message"]')}`;
    const res = await fetch(url);
    const body = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: TelegramUpdate[];
    };
    if (!res.ok || !body.ok) {
      throw new Error(
        `Telegram getUpdates ${res.status}: ${body.description ?? 'bilinmeyen hata'}`,
      );
    }
    this.conflictLogged = false;
    return body.result ?? [];
  }

  /** Markdown'da başlık metnini bozabilecek karakterleri etkisizleştirir. */
  private escape(text: string): string {
    return text.replace(/([*_`[\]])/g, '\\$1');
  }
}
