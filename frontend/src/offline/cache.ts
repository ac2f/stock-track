import { idbAll, idbDelete, idbGet, idbPut } from './idb';

/**
 * Son görülen yanıtlar (yalnız GET). Sunucuya ulaşılamazken ekranlar boş
 * kalmasın diye en son gelen liste/kart gösterilir. Kullanıcı ve dükkân
 * başına ayrıdır; eskiler kendiliğinden silinir.
 */
interface CacheEntry extends Record<string, unknown> {
  key: string;
  userId: string;
  shopId: string;
  at: number;
  data: unknown;
}

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 400;
/** Çöp temizliği en erken bu kadar yazmada ve bu kadar sürede bir yapılır. */
const PRUNE_EVERY_WRITES = 50;
const PRUNE_MIN_INTERVAL_MS = 5 * 60_000;
/** Bir yolun arama havuzunda en çok bu kadar kayıt tutulur. */
const SEARCH_POOL_MAX = 200;
const SEARCH_POOL = '~search';
let writesSincePrune = 0;
let lastPruneAt = Date.now();

export function cacheKey(
  userId: string,
  shopId: string | null,
  url: string,
  params?: Record<string, unknown>,
): string {
  const sorted = params
    ? Object.keys(params)
        .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort()
        .map((k) => `${k}=${String(params[k])}`)
        .join('&')
    : '';
  return `${userId}|${shopId ?? '-'}|${url}|${sorted}`;
}

export async function cachePut(key: string, data: unknown): Promise<void> {
  const [userId, shopId] = key.split('|');
  await idbPut<CacheEntry>('cache', { key, userId, shopId, at: Date.now(), data });
  // Temizlik bütün kayıtları okur: sık yazmada (ör. arama) her seferinde değil,
  // yeterince yazma birikince ve en erken birkaç dakikada bir yapılır.
  if (++writesSincePrune >= PRUNE_EVERY_WRITES && Date.now() - lastPruneAt >= PRUNE_MIN_INTERVAL_MS) {
    writesSincePrune = 0;
    lastPruneAt = Date.now();
    void pruneCache();
  }
}

/**
 * Arama yanıtı: her arama terimi için ayrı kayıt açılmaz; kayıtlar yolun tek
 * "arama havuzuna" katılır (en yeniler önde, sınırlı sayıda). Çevrimdışı
 * arama (cacheSearch) bu havuzu da tarar.
 */
export async function cacheMergeSearch(
  userId: string,
  shopId: string | null,
  path: string,
  data: unknown,
): Promise<void> {
  const incoming = itemsOf(data);
  if (!incoming) return;
  const key = `${userId}|${shopId ?? '-'}|${path}|${SEARCH_POOL}`;
  const prev = await idbGet<CacheEntry>('cache', key);
  const prevItems = prev ? itemsOf(prev.data)?.items ?? [] : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of [...incoming.items, ...prevItems]) {
    const id = String(item.id ?? JSON.stringify(item));
    if (!byId.has(id)) byId.set(id, item);
    if (byId.size >= SEARCH_POOL_MAX) break;
  }
  const items = [...byId.values()];
  const merged =
    incoming.shape === 'array'
      ? items
      : { items, meta: { total: items.length, page: 1, limit: items.length, pageCount: 1 } };
  await cachePut(key, merged);
}

export async function cacheGet(key: string): Promise<{ data: unknown; at: number } | undefined> {
  const entry = await idbGet<CacheEntry>('cache', key);
  if (!entry || Date.now() - entry.at > MAX_AGE_MS) return undefined;
  return { data: entry.data, at: entry.at };
}

/**
 * Çöp temizliği: süresi geçmiş yanıtlar ve sınırı aşan en eskiler silinir.
 * `keepShops` verilirse kullanıcının artık erişemediği dükkânların kayıtları
 * da gider.
 */
export async function pruneCache(opts: { userId?: string; keepShops?: string[] } = {}): Promise<number> {
  const all = await idbAll<CacheEntry>('cache');
  const now = Date.now();
  const doomed = new Set<string>();
  for (const e of all) {
    if (now - e.at > MAX_AGE_MS) doomed.add(e.key);
    else if (opts.userId && opts.keepShops && e.userId === opts.userId && e.shopId !== '-' && !opts.keepShops.includes(e.shopId)) {
      doomed.add(e.key);
    }
  }
  const live = all.filter((e) => !doomed.has(e.key)).sort((a, b) => b.at - a.at);
  for (const e of live.slice(MAX_ENTRIES)) doomed.add(e.key);
  for (const key of doomed) await idbDelete('cache', key);
  return doomed.size;
}

/** Oturum kapanınca o kullanıcının önbelleği silinir (ortak bilgisayar). */
export async function clearUserCache(userId: string): Promise<void> {
  const all = await idbAll<CacheEntry>('cache');
  for (const e of all) if (e.userId === userId) await idbDelete('cache', e.key);
}

/** Türkçe harfe ve büyük/küçük harfe duyarsız karşılaştırma için katlama. */
function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

type ListShape = 'array' | 'paged';

function itemsOf(data: unknown): { items: Record<string, unknown>[]; shape: ListShape } | null {
  if (Array.isArray(data)) return { items: data as Record<string, unknown>[], shape: 'array' };
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return { items: (data as { items: Record<string, unknown>[] }).items, shape: 'paged' };
  }
  return null;
}

/**
 * Çevrimdışı liste araması: istenen sorgunun kayıtlı bir kopyası yoksa aynı
 * listenin cihazdaki bütün kopyalarındaki kayıtlar birleştirilir ve arama
 * terimi burada süzülür (ör. müşteri seçicide yazılan her harf ayrı bir
 * istektir; çevrimdışıyken bunlar yerelde aranır). `extra` sıradaki yeni
 * kayıtlardır (çevrimdışı açılan müşteri gibi); listenin başına eklenir.
 */
export async function cacheSearch(
  userId: string,
  shopId: string | null,
  path: string,
  params: Record<string, unknown> | undefined,
  extra: Record<string, unknown>[],
): Promise<unknown | undefined> {
  const prefix = `${userId}|${shopId ?? '-'}|${path}|`;
  const entries = (await idbAll<CacheEntry>('cache'))
    .filter((e) => e.key.startsWith(prefix) && Date.now() - e.at <= MAX_AGE_MS)
    .sort((a, b) => b.at - a.at);
  // Biçim (dizi mi, sayfalı mı) yalnız kayıtlı bir yanıttan bilinir; hiç
  // kopya yoksa tahmin edilmez (yanlış biçim ekranı bozar).
  let shape: ListShape | null = null;
  const byId = new Map<string, Record<string, unknown>>();
  for (const x of extra) byId.set(String(x.id), x);
  for (const e of entries) {
    const list = itemsOf(e.data);
    if (!list) continue;
    shape ??= list.shape;
    for (const item of list.items) {
      const id = String(item.id ?? JSON.stringify(item));
      if (!byId.has(id)) byId.set(id, item);
    }
  }
  if (!shape) return undefined;

  const term = String(params?.search ?? params?.q ?? '').trim();
  const tokens = fold(term).split(/\s+/).filter(Boolean);
  let items = [...byId.values()];
  if (tokens.length) {
    items = items.filter((item) => {
      const hay = fold(
        Object.values(item)
          .filter((v) => typeof v === 'string' || typeof v === 'number')
          .join(' '),
      );
      return tokens.every((t) => hay.includes(t));
    });
  }
  if (shape === 'array') return items;
  const limit = Math.max(1, Number(params?.limit) || 20);
  const page = Math.max(1, Number(params?.page) || 1);
  return {
    items: items.slice((page - 1) * limit, page * limit),
    meta: { total: items.length, page, limit, pageCount: Math.max(1, Math.ceil(items.length / limit)) },
  };
}

/** Kayıtlı bir liste yanıtının başına sıradaki yeni kayıtları ekler. */
export function withPending(data: unknown, extra: Record<string, unknown>[]): unknown {
  if (!extra.length) return data;
  const list = itemsOf(data);
  if (!list) return data;
  const ids = new Set(list.items.map((i) => String(i.id)));
  const fresh = extra.filter((x) => !ids.has(String(x.id)));
  if (list.shape === 'array') return [...fresh, ...list.items];
  const d = data as { items: unknown[]; meta?: Record<string, number> };
  return { ...d, items: [...fresh, ...d.items], meta: d.meta ? { ...d.meta, total: (d.meta.total ?? 0) + fresh.length } : d.meta };
}
