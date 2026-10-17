import { idbAll, idbDelete, idbPut } from './idb';

/**
 * Sunucuya ulaşılamadığında yapılan işlemlerin kuyruğu. Her işlem, yapıldığı
 * kullanıcı ve dükkânla birlikte saklanır; bağlantı gelince sırasıyla
 * gönderilir. İşlemin kimliği aynı zamanda `Idempotency-Key`'dir: gönderim
 * yarıda kesilip tekrarlansa bile sunucu onu bir kez işler.
 *
 * Yeni kayıt açan işlemler (müşteri, teklif ...) geçici bir kimlik alır. Aynı
 * kuyrukta o kayda bağlı sonraki işlemler (ör. yeni müşteriye tahsilat) bu
 * geçici kimliği taşır; kayıt sunucuda açılınca gerçek kimlik yerine yazılır.
 */
export interface OutboxOp extends Record<string, unknown> {
  id: string;
  userId: string;
  shopId: string | null;
  method: string;
  url: string;
  params?: Record<string, unknown>;
  body?: unknown;
  label: string;
  /** Yeni kaydın geçici kimliği. */
  tempId?: string;
  createdAt: number;
  /** pending: sırada · failed: sunucu reddetti · blocked: reddedilen bir işleme bağlı */
  status: 'pending' | 'failed' | 'blocked';
  error?: string;
  attempts: number;
}

export async function enqueue(op: OutboxOp): Promise<void> {
  await idbPut('outbox', op);
}

export async function listOps(userId: string | null): Promise<OutboxOp[]> {
  if (!userId) return [];
  const all = await idbAll<OutboxOp>('outbox');
  return all.filter((o) => o.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveOp(op: OutboxOp): Promise<void> {
  await idbPut('outbox', op);
}

export async function removeOp(id: string): Promise<void> {
  await idbDelete('outbox', id);
}

/** İşlem başka bir işlemin geçici kimliğini taşıyor mu? */
export function dependsOn(op: OutboxOp, tempId: string): boolean {
  return op.url.includes(tempId) || JSON.stringify(op.body ?? null).includes(tempId);
}

/** Geçici kimliği gerçeğiyle değiştirir (adres ve gövdede). */
export function remap(op: OutboxOp, tempId: string, realId: string): OutboxOp {
  return {
    ...op,
    url: op.url.split(tempId).join(realId),
    body: op.body === undefined ? undefined : JSON.parse(JSON.stringify(op.body).split(tempId).join(realId)),
  };
}

/** Sunucu yanıtındaki yeni kaydın kimliği ({id} ya da {payment:{id}} gibi). */
export function createdId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  if (typeof d.id === 'string') return d.id;
  for (const v of Object.values(d)) {
    if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).id === 'string') {
      return (v as Record<string, unknown>).id as string;
    }
  }
  return undefined;
}

export type SendResult =
  | { ok: true; data: unknown }
  | { ok: false; offline: true }
  | { ok: false; offline: false; message: string };

/**
 * Kuyruğu sırayla gönderir. Bağlantı yeniden koparsa durur (sonra kaldığı
 * yerden devam edilir). Sunucunun reddettiği işlem "failed" olur ve ona bağlı
 * sonrakiler "blocked" bekler; bağımsız işlemler gönderilmeye devam eder.
 */
export async function flush(
  userId: string,
  send: (op: OutboxOp) => Promise<SendResult>,
): Promise<{ sent: number; failed: number; stoppedOffline: boolean }> {
  let ops = await listOps(userId);
  let sent = 0;
  let stoppedOffline = false;
  const failedTemp = ops.filter((o) => o.status === 'failed' && o.tempId).map((o) => o.tempId!);

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.status === 'failed') continue;
    if (failedTemp.some((t) => dependsOn(op, t))) {
      if (op.status !== 'blocked') await saveOp({ ...op, status: 'blocked' });
      continue;
    }
    const result = await send(op);
    if (!result.ok && result.offline) {
      stoppedOffline = true;
      break;
    }
    if (!result.ok) {
      await saveOp({ ...op, status: 'failed', error: result.message, attempts: op.attempts + 1 });
      if (op.tempId) failedTemp.push(op.tempId);
      continue;
    }
    await removeOp(op.id);
    sent += 1;
    const realId = op.tempId ? createdId(result.data) : undefined;
    if (op.tempId && realId) {
      // Sonraki işlemlerde geçici kimlik → gerçek kimlik (kalıcı olarak).
      for (let j = i + 1; j < ops.length; j++) {
        if (dependsOn(ops[j], op.tempId)) {
          ops[j] = remap(ops[j], op.tempId, realId);
          await saveOp(ops[j]);
        }
      }
    }
  }
  ops = await listOps(userId);
  return { sent, failed: ops.filter((o) => o.status !== 'pending').length, stoppedOffline };
}
