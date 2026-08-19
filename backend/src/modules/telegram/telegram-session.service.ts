import { Injectable } from '@nestjs/common';

/**
 * Çok adımlı akışlarda (tutar gir → yöntem seç → onayla) sohbetin nerede
 * kaldığını tutar. Bellekte tutulur: sunucu yeniden başlarsa yarım kalan akış
 * düşer, kullanıcı menüden yeniden başlar — kalıcı veri değildir.
 */
export interface Session {
  /** Beklenen metin girdisi; yoksa kullanıcı menüde geziyor demektir. */
  awaiting?:
    | 'customer-search'
    | 'stock-search'
    | 'payment-amount'
    | 'settle-amount'
    | 'ledger-amount';
  data: Record<string, string>;
  updatedAt: number;
}

/** Bir oturum bu süre boyunca dokunulmazsa düşer. */
const TTL_MS = 15 * 60 * 1000;

@Injectable()
export class TelegramSessionService {
  private readonly sessions = new Map<number, Session>();

  get(chatId: number): Session {
    const existing = this.sessions.get(chatId);
    if (existing && Date.now() - existing.updatedAt < TTL_MS) {
      return existing;
    }
    const fresh: Session = { data: {}, updatedAt: Date.now() };
    this.sessions.set(chatId, fresh);
    return fresh;
  }

  /** Oturumu günceller (kısmi). Verilen alanlar birleştirilir. */
  patch(chatId: number, patch: Partial<Session>): Session {
    const s = this.get(chatId);
    const next: Session = {
      ...s,
      ...patch,
      data: { ...s.data, ...(patch.data ?? {}) },
      updatedAt: Date.now(),
    };
    this.sessions.set(chatId, next);
    return next;
  }

  /** Beklenen girdiyi temizler (akış tamamlandı/iptal edildi). */
  clearAwaiting(chatId: number): void {
    this.patch(chatId, { awaiting: undefined });
  }

  /** Akışı tamamen sıfırlar (ana menüye dönüş). */
  reset(chatId: number): void {
    this.sessions.set(chatId, { data: {}, updatedAt: Date.now() });
  }

  /** Süresi dolmuş oturumları temizler (bellek sızıntısını önler). */
  sweep(): void {
    const now = Date.now();
    for (const [chatId, s] of this.sessions) {
      if (now - s.updatedAt > TTL_MS) this.sessions.delete(chatId);
    }
  }
}
