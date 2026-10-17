import type { QueryClient } from '@tanstack/react-query';
import { api, isOfflineError } from '../api/client';
import { pruneCache } from './cache';
import { getNetState, patchNetState } from './network';
import {
  dependsOn,
  flush,
  listOps,
  removeOp,
  saveOp,
  type OutboxOp,
  type SendResult,
} from './outbox';
import { getSessionUser } from './session';

/**
 * Eşzamanlama: sunucu geri gelince kuyruğu gönderir, ekranları tazeler ve
 * çöpü temizler. Tetikleyiciler: tarayıcının "çevrimiçi" olayı, çevrimdışıyken
 * düzenli sağlık denetimi, uygulamanın açılışı ve kullanıcının "şimdi dene"si.
 */
const PROBE_MS = 15_000;
let queryClient: QueryClient | null = null;
let running: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** Sunucu ve veritabanı yanıt veriyor mu? */
async function probe(): Promise<boolean> {
  try {
    // _replay: önbellekten yanıt verilmesin — gerçekten sunucuya sorulur.
    await api.get('/health', { timeout: 5000, _replay: true } as never);
    return true;
  } catch {
    return false;
  }
}

async function send(op: OutboxOp): Promise<SendResult> {
  try {
    const res = await api.request({
      method: op.method,
      url: op.url,
      params: op.params,
      data: op.body,
      headers: {
        'Idempotency-Key': op.id,
        ...(op.shopId ? { 'X-Shop-Id': op.shopId } : {}),
      },
      _replay: true,
    } as never);
    return { ok: true, data: res.data };
  } catch (err) {
    if (isOfflineError(err)) return { ok: false, offline: true };
    const e = err as { response?: { status?: number; data?: { message?: string | string[] } } };
    // Oturum kapandıysa (401) işlem silinmez; yeniden girişten sonra gönderilir.
    if (e.response?.status === 401) return { ok: false, offline: true };
    const m = e.response?.data?.message;
    return {
      ok: false,
      offline: false,
      message: (Array.isArray(m) ? m.join(', ') : m) || `Sunucu reddetti (${e.response?.status ?? '?'})`,
    };
  }
}

/** Kuyruk sayaçlarını yeniden hesaplar (başlıktaki şerit). */
export async function refreshCounts(): Promise<OutboxOp[]> {
  const ops = await listOps(getSessionUser());
  patchNetState({
    pending: ops.filter((o) => o.status === 'pending').length,
    failed: ops.filter((o) => o.status !== 'pending').length,
  });
  return ops;
}

/** Sunucu varsa kuyruğu gönderir; aynı anda tek eşzamanlama çalışır. */
export function syncNow(): Promise<void> {
  running ??= (async () => {
    const user = getSessionUser();
    try {
      if (!(await probe())) {
        patchNetState({ online: false });
        return;
      }
      patchNetState({ online: true });
      if (!user) return;
      const before = await refreshCounts();
      if (!before.some((o) => o.status === 'pending')) return;
      patchNetState({ syncing: true });
      const result = await flush(user, send);
      if (result.sent > 0) {
        // Kuyruktaki kayıtlar artık sunucuda: listeler gerçeğini göstersin.
        await queryClient?.invalidateQueries();
        patchNetState({ lastSyncAt: Date.now() });
      }
      if (result.stoppedOffline) patchNetState({ online: false });
      await pruneCache();
    } finally {
      patchNetState({ syncing: false });
      await refreshCounts();
      running = null;
    }
  })();
  return running;
}

/** Reddedilen işlemi (ve ona bağlı bekleyenleri) yeniden sıraya koyar. */
export async function retryOp(id: string): Promise<void> {
  const ops = await listOps(getSessionUser());
  const op = ops.find((o) => o.id === id);
  if (!op) return;
  await saveOp({ ...op, status: 'pending', error: undefined });
  if (op.tempId) {
    for (const other of ops) {
      if (other.status === 'blocked' && dependsOn(other, op.tempId)) {
        await saveOp({ ...other, status: 'pending' });
      }
    }
  }
  await syncNow();
}

/** İşlemi kuyruktan atar; ona bağlı işlemler de gider. Atılanların sayısı. */
export async function discardOp(id: string): Promise<number> {
  const ops = await listOps(getSessionUser());
  const op = ops.find((o) => o.id === id);
  if (!op) return 0;
  const doomed = [op, ...(op.tempId ? ops.filter((o) => o.id !== id && dependsOn(o, op.tempId!)) : [])];
  for (const o of doomed) await removeOp(o.id);
  await refreshCounts();
  return doomed.length;
}

/** Bir işleme bağlı olup onunla birlikte atılacaklar (onay iletisi için). */
export async function dependentsOf(id: string): Promise<OutboxOp[]> {
  const ops = await listOps(getSessionUser());
  const op = ops.find((o) => o.id === id);
  if (!op?.tempId) return [];
  return ops.filter((o) => o.id !== id && dependsOn(o, op.tempId!));
}

/**
 * Uygulama açılışında bir kez: olay dinleyicileri ve çevrimdışıyken düzenli
 * sağlık denetimi.
 */
export function startSync(qc: QueryClient): void {
  queryClient = qc;
  if (timer) return;
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => patchNetState({ online: false }));
  timer = setInterval(() => {
    const s = getNetState();
    if (!s.online || s.pending > 0) void syncNow();
  }, PROBE_MS);
  void syncNow();
}
