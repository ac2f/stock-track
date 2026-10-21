import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Merkezde `POST /sync/push`, her işlemi uygulamanın KENDİ uçlarına
 * (127.0.0.1) iç istek olarak gönderir; böylece doğrulama, yetki, iş
 * kuralları ve tekrar koruması aynen çalışır. İç isteği dışarıdan gelenden
 * ayıran bu başlık değeridir: JWT anahtarından türetilir (cluster'daki bütün
 * süreçlerde aynıdır, dışarı hiç verilmez).
 */
export const REPLAY_HEADER = 'x-sync-replay';
export const REPLAY_META_HEADER = 'x-sync-meta';
export const REPLAY_RESULT_HEADER = 'x-sync-created';

export function replaySecret(jwtAccessSecret: string): string {
  return createHmac('sha256', jwtAccessSecret).update('stocktrack-sync-replay-v1').digest('hex');
}

export function isReplaySecret(candidate: string | undefined, secret: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Başlıkta taşınan JSON (base64url). */
export function encodeHeaderJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeHeaderJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return undefined;
  }
}
