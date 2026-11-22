/**
 * Bir listenin durumu (arama, filtre, sayfa, sekme) adres çubuğunda: yenileyince, geri gelince ya da bağlantı
 * paylaşılınca aynı liste açılır. Burada yalnız okuma / yazma kuralları var (saf, sınanabilir); bağlama
 * hooks/useUrlState.ts'te.
 *
 * - Yalnız ``keys``'te sayılan anahtarlar okunur / yazılır (aynı sayfadaki başka bir liste ya da tek seferlik
 *   ?new / ?q parametreleri karışmaz). ``prefix`` iki listeyi aynı sayfada ayırır (``t.page``).
 * - Varsayılan değerler adrese yazılmaz: adres yalnız değiştirilenleri taşır.
 * - Sayıya çevrilen anahtarlar: varsayılanı sayı olanlar ve ``numbers``'ta sayılanlar; ``true`` / ``false``
 *   evet / hayır olur. Gerisi metin kalır (müşteri adında "2026" yazılabilir).
 */
export type UrlValue = string | number | boolean | undefined | null;

export interface UrlStateOptions<T> {
  keys: readonly (keyof T & string)[];
  numbers?: readonly (keyof T & string)[];
  prefix?: string;
}

export function readUrlState<T extends object>(params: URLSearchParams, defaults: T, opts: UrlStateOptions<T>): T {
  const out = { ...defaults } as Record<string, unknown>;
  const nums = new Set<string>(opts.numbers ?? []);
  for (const key of opts.keys) {
    const raw = params.get((opts.prefix ?? '') + key);
    if (raw == null) continue;
    const def = (defaults as Record<string, unknown>)[key];
    if (typeof def === 'number' || nums.has(key)) {
      const n = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(n)) out[key] = n;
    } else if (typeof def === 'boolean' || raw === 'true' || raw === 'false') {
      out[key] = raw === 'true' || raw === '1';
    } else {
      out[key] = raw;
    }
  }
  return out as T;
}

/** ``params`` ile ``state``'in birleşimi: bu listenin anahtarları yeniden yazılır, başkalarınınkiler korunur. */
export function writeUrlState<T extends object>(
  params: URLSearchParams,
  state: T,
  defaults: T,
  opts: UrlStateOptions<T>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of opts.keys) {
    const name = (opts.prefix ?? '') + key;
    const v = (state as Record<string, UrlValue>)[key];
    const def = (defaults as Record<string, UrlValue>)[key];
    if (v == null || v === '' || v === def) next.delete(name);
    else next.set(name, String(v));
  }
  return next;
}
