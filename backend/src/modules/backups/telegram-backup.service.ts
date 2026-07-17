import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BackupConfig, NotificationsConfig } from '../../config/configuration';
import { BackupsService } from './backups.service';
import { BackupCryptoService } from './backup-crypto.service';

export type BackupKind = 'auto' | 'manual';

interface DailyEntry {
  at: string; // ISO
  fileName: string;
  size: number; // şifreli boyut (bayt)
  kind: BackupKind;
}

export interface TelegramBackupState {
  chatId: string;
  dayKey: string; // YYYY-MM-DD (yerel gün)
  messageId: number;
  pinnedMessageId: number | null;
  entries: DailyEntry[];
  updatedAt: string;
}

export interface TelegramBackupResult {
  ok: boolean;
  action: 'created' | 'updated';
  messageId: number;
  dayKey: string;
  fileName: string;
  size: number;
  entryCount: number;
}

/**
 * Şifreli veritabanı yedeğini Telegram'a gönderir ve GÜN İÇİNDE TEK bir mesaj
 * olacak şekilde ilerletir:
 *  - Günün ilk yedeği → yeni bir belge mesajı gönderilir, sabitlenir (pin);
 *    önceki günün sabiti kaldırılır.
 *  - Aynı gün sonraki yedekler → yeni mesaj atmak yerine mevcut mesajın hem
 *    eki (en yeni yedek) hem başlığı (o güne ait tüm yedeklerin zaman/boyut
 *    dökümü) editMessageMedia ile güncellenir.
 *
 * Uyku/uyanma: karar tamamen tarihe göre verilir. Süreç uykudan uyanıp yeni bir
 * yedek aldığında, kalıcı durum dosyasındaki günle bugünü kıyaslar; aynı günse
 * mevcut mesajı günceller, farklı günse (yeni gün) yeni mesaj gönderir. Böylece
 * ayrı bir işletim sistemi uyku kancasına gerek kalmaz.
 */
@Injectable()
export class TelegramBackupService {
  private readonly logger = new Logger(TelegramBackupService.name);
  private readonly cfg: BackupConfig;
  private readonly botToken: string;
  // Eşzamanlı çağrıları (saatlik cron + elle tetik) sıraya sokan basit kilit.
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly backups: BackupsService,
    private readonly crypto: BackupCryptoService,
    configService: ConfigService,
  ) {
    this.cfg = configService.get<BackupConfig>('backup')!;
    this.botToken =
      configService.get<NotificationsConfig>('notifications')!.telegramBotToken;
  }

  isConfigured(): boolean {
    return !!this.botToken && !!this.cfg.telegramChatId;
  }

  /** Çağrıları seri işletir → durum dosyası ve Telegram mesajı tutarlı kalır. */
  runAndSend(kind: BackupKind): Promise<TelegramBackupResult> {
    const next = this.chain.then(
      () => this.doRunAndSend(kind),
      () => this.doRunAndSend(kind),
    );
    // Kilit zincirini hatadan bağımsız devam ettir.
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async doRunAndSend(kind: BackupKind): Promise<TelegramBackupResult> {
    if (!this.botToken) {
      throw new BadRequestException(
        'Telegram bot jetonu (TELEGRAM_BOT_TOKEN) tanımlı değil.',
      );
    }
    if (!this.cfg.telegramChatId) {
      throw new BadRequestException(
        'Telegram sohbet kimliği (BACKUP_TELEGRAM_CHAT_ID / TELEGRAM_OWNER_CHAT_ID) tanımlı değil.',
      );
    }
    const chatId = this.cfg.telegramChatId;

    // 1) Yedek al (geçici) → şifrele → geçici .enc dosyası.
    const created = await this.backups.createBackup(false);
    let encBuffer: Buffer;
    try {
      encBuffer = await this.crypto.encryptFile(created.filePath);
    } finally {
      await fs.unlink(created.filePath).catch(() => undefined);
    }
    const encName = `${created.fileName}.enc`;

    const now = new Date();
    const entry: DailyEntry = {
      at: now.toISOString(),
      fileName: encName,
      size: encBuffer.length,
      kind,
    };
    const todayKey = this.dayKey(now);

    // 2) Durumu yükle ve aynı gün mü karar ver.
    const prev = await this.loadState();
    const sameDay =
      !!prev &&
      prev.chatId === chatId &&
      prev.dayKey === todayKey &&
      !!prev.messageId;

    if (sameDay && prev) {
      const entries = [...prev.entries, entry];
      const caption = this.buildCaption(entries, todayKey);
      try {
        await this.editMessageMedia(
          chatId,
          prev.messageId,
          encBuffer,
          encName,
          caption,
        );
        const state: TelegramBackupState = {
          chatId,
          dayKey: todayKey,
          messageId: prev.messageId,
          pinnedMessageId: prev.pinnedMessageId ?? prev.messageId,
          entries,
          updatedAt: now.toISOString(),
        };
        await this.saveState(state);
        // Sabit hâlâ duruyor olsa da tazele (mesaj yeniden sabit kalsın).
        await this.pinChatMessage(chatId, prev.messageId).catch(() => undefined);
        return {
          ok: true,
          action: 'updated',
          messageId: prev.messageId,
          dayKey: todayKey,
          fileName: encName,
          size: encBuffer.length,
          entryCount: entries.length,
        };
      } catch (err) {
        // Mesaj silinmiş/erişilemiyor olabilir → yeni mesaja düş.
        this.logger.warn(
          `Mevcut günlük mesaj güncellenemedi, yeni mesaj gönderilecek: ${(err as Error).message}`,
        );
      }
    }

    // 3) Yeni gün (veya durum yok / güncelleme başarısız) → yeni mesaj + sabitle.
    const entries = [entry];
    const caption = this.buildCaption(entries, todayKey);
    const messageId = await this.sendDocument(
      chatId,
      encBuffer,
      encName,
      caption,
    );

    // Önceki sabitleri kaldır, yeni mesajı sabitle.
    await this.unpinAll(chatId, prev?.pinnedMessageId ?? null);
    await this.pinChatMessage(chatId, messageId).catch((err) =>
      this.logger.warn(`Mesaj sabitlenemedi: ${(err as Error).message}`),
    );

    const state: TelegramBackupState = {
      chatId,
      dayKey: todayKey,
      messageId,
      pinnedMessageId: messageId,
      entries,
      updatedAt: now.toISOString(),
    };
    await this.saveState(state);
    return {
      ok: true,
      action: 'created',
      messageId,
      dayKey: todayKey,
      fileName: encName,
      size: encBuffer.length,
      entryCount: 1,
    };
  }

  /** Arayüzde göstermek için o günkü durum (varsa). */
  async getState(): Promise<TelegramBackupState | null> {
    return this.loadState();
  }

  // ── Durum kalıcılığı ───────────────────────────────────────────────
  private statePath(): string {
    const p = this.cfg.stateFile;
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  }

  private async loadState(): Promise<TelegramBackupState | null> {
    try {
      const raw = await fs.readFile(this.statePath(), 'utf8');
      return JSON.parse(raw) as TelegramBackupState;
    } catch {
      return null;
    }
  }

  private async saveState(state: TelegramBackupState): Promise<void> {
    const p = this.statePath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(state, null, 2), 'utf8');
  }

  private dayKey(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** Günlük mesaj başlığı (Telegram caption ≤ 1024 karakter, düz metin). */
  private buildCaption(entries: DailyEntry[], dayKey: string): string {
    const header =
      `🔐 Günlük şifreli veritabanı yedeği — ${dayKey}\n` +
      `Şifre çözme anahtarı: web arayüzü › Ayarlar › Yedekleme\n`;
    const footer =
      `\nToplam ${entries.length} yedek · en yeni yedek ekte (.enc).`;

    const fmt = (e: DailyEntry, i: number) => {
      const t = new Date(e.at).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const kb = Math.max(1, Math.round(e.size / 1024));
      const k = e.kind === 'manual' ? 'manuel' : 'otomatik';
      return `${i + 1}) ${t} · ${k} · ${kb} KB`;
    };

    // En yeniyi en altta tutarak listele; gerekiyorsa en eskileri kırp.
    let lines = entries.map(fmt);
    let omitted = 0;
    const compose = () =>
      header +
      (omitted > 0 ? `… (+${omitted} önceki yedek)\n` : '') +
      lines.join('\n') +
      footer;
    while (compose().length > 1024 && lines.length > 1) {
      lines = lines.slice(1);
      omitted += 1;
    }
    return compose();
  }

  // ── Telegram Bot API çağrıları (fetch + multipart) ────────────────
  private api(method: string): string {
    return `https://api.telegram.org/bot${this.botToken}/${method}`;
  }

  private async sendDocument(
    chatId: string,
    buffer: Buffer,
    fileName: string,
    caption: string,
  ): Promise<number> {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('document', this.toBlob(buffer), fileName);
    const json = await this.call('sendDocument', form);
    return json.result.message_id as number;
  }

  private async editMessageMedia(
    chatId: string,
    messageId: number,
    buffer: Buffer,
    fileName: string,
    caption: string,
  ): Promise<void> {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('message_id', String(messageId));
    form.append(
      'media',
      JSON.stringify({ type: 'document', media: 'attach://doc', caption }),
    );
    form.append('doc', this.toBlob(buffer), fileName);
    await this.call('editMessageMedia', form);
  }

  /** Buffer'ı, TS DOM tipleriyle uyumlu bir Blob'a çevirir (kopya). */
  private toBlob(buffer: Buffer): Blob {
    return new Blob([Uint8Array.from(buffer)]);
  }

  private async pinChatMessage(chatId: string, messageId: number): Promise<void> {
    await this.callJson('pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: true,
    });
  }

  /** Önceki sabiti (biliniyorsa) kaldırır; ayrıca sohbetteki tüm sabitleri temizler. */
  private async unpinAll(
    chatId: string,
    previousPinnedId: number | null,
  ): Promise<void> {
    if (previousPinnedId) {
      await this.callJson('unpinChatMessage', {
        chat_id: chatId,
        message_id: previousPinnedId,
      }).catch(() => undefined);
    }
    await this.callJson('unpinAllChatMessages', { chat_id: chatId }).catch(
      () => undefined,
    );
  }

  private async call(
    method: string,
    form: FormData,
  ): Promise<{ ok: boolean; result: { message_id: number } }> {
    const res = await fetch(this.api(method), { method: 'POST', body: form });
    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result: { message_id: number };
    };
    if (!res.ok || !json.ok) {
      throw new Error(
        `Telegram ${method} ${res.status}: ${json.description ?? 'bilinmeyen hata'}`,
      );
    }
    return json;
  }

  private async callJson(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const res = await fetch(this.api(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!res.ok || !json.ok) {
      throw new Error(
        `Telegram ${method} ${res.status}: ${json.description ?? 'bilinmeyen hata'}`,
      );
    }
  }
}
