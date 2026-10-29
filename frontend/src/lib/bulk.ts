import { mapLimit } from './concurrency';
import { apiErrorMessage } from './toast';

export interface BulkFailure {
  id: string;
  label: string;
  reason: string;
}

export interface BulkResult {
  /** Başarıyla uygulananların kimlikleri. */
  okIds: string[];
  failed: BulkFailure[];
}

interface BulkOptions<T> {
  /** En çok kaç grup aynı anda çalışsın (varsayılan 4). */
  concurrency?: number;
  /** Aynı anahtarı paylaşan kayıtlar SIRAYLA çalışır (ör. aynı plakanın stok düşümü). */
  serialKey?: (item: T) => string;
  /** Hata satırında gösterilecek ad. */
  label?: (item: T) => string;
}

/**
 * Toplu işlem yürütücü: biri başarısız olsa da diğerleri sürer; sonuçta hangi
 * kayıtların uygulandığı ve neden uygulanamayanların bulunduğu döner.
 */
export async function runBulk<T extends { id: string }>(
  items: readonly T[],
  fn: (item: T) => Promise<unknown>,
  opts: BulkOptions<T> = {},
): Promise<BulkResult> {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const key = opts.serialKey ? opts.serialKey(it) : it.id;
    const arr = buckets.get(key);
    if (arr) arr.push(it);
    else buckets.set(key, [it]);
  }
  const okIds: string[] = [];
  const failed: BulkFailure[] = [];
  await mapLimit([...buckets.values()], opts.concurrency ?? 4, async (bucket) => {
    for (const it of bucket) {
      try {
        await fn(it);
        okIds.push(it.id);
      } catch (e) {
        failed.push({
          id: it.id,
          label: opts.label?.(it) ?? it.id.slice(0, 8),
          reason: apiErrorMessage(e, 'Uygulanamadı.'),
        });
      }
    }
  });
  return { okIds, failed };
}

export interface BulkReport {
  tone: 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

/**
 * Sonucu kullanıcıya tek cümleyle anlatır: "5 iş tamamlandı" ya da
 * "3 iş tamamlandı, 2 iş tamamlanamadı" + ilk hatanın nedeni (aynı neden
 * tekrarlıyorsa bir kez). `done`/`notDone`: fiilin olumlu ve olumsuz biçimi.
 */
export function bulkReport(
  noun: string,
  verbs: { done: string; notDone: string },
  r: BulkResult,
  skipped = 0,
): BulkReport {
  const ok = r.okIds.length;
  const fail = r.failed.length;
  const extra = skipped ? ` (${skipped} ${noun} atlandı)` : '';
  if (!fail) {
    return { tone: 'success', title: `${ok} ${noun} ${verbs.done}${extra}` };
  }
  const first = r.failed[0];
  const sameReason = r.failed.every((f) => f.reason === first.reason);
  const detail = sameReason
    ? `${first.label}: ${first.reason}`
    : `${first.label}: ${first.reason} (+${fail - 1} başka hata)`;
  return {
    tone: ok ? 'warning' : 'error',
    title: ok
      ? `${ok} ${noun} ${verbs.done}, ${fail} ${noun} ${verbs.notDone}${extra}`
      : `${fail} ${noun} ${verbs.notDone}${extra}`,
    detail,
  };
}
