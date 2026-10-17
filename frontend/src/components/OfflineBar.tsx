import { useEffect, useState } from 'react';
import { useNetState } from '../offline/network';
import { listOps, type OutboxOp } from '../offline/outbox';
import { getSessionUser } from '../offline/session';
import { dependentsOf, discardOp, retryOp, syncNow } from '../offline/sync';
import { useAuth } from '../context/AuthContext';

const time = (ms: number) =>
  new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Bağlantı şeridi: sunucuya ulaşılamıyorken, kuyrukta işlem varken ya da
 * sunucunun reddettiği bir işlem varken görünür. Tıklanınca kuyruk açılır.
 */
export function OfflineBar() {
  const net = useNetState();
  const [open, setOpen] = useState(false);
  const visible = !net.online || net.pending > 0 || net.failed > 0 || net.syncing;
  if (!visible && !open) return null;

  let tone = 'bg-amber-100 text-amber-900 border-amber-300';
  let text: string;
  if (!net.online) {
    text = net.pending
      ? `Çevrimdışı — ${net.pending} işlem bu cihazda bekliyor; bağlantı gelince gönderilecek.`
      : 'Çevrimdışı — son kaydedilen veriler gösteriliyor. Müşteri, tahsilat, teklif, satış ve iş kayıtları sıraya alınır.';
  } else if (net.syncing) {
    tone = 'bg-sky-100 text-sky-900 border-sky-300';
    text = `Eşzamanlanıyor… (${net.pending} işlem)`;
  } else if (net.failed) {
    tone = 'bg-red-100 text-red-900 border-red-300';
    text = `${net.failed} işlem sunucuya işlenemedi — bakmanız gerekiyor.`;
  } else {
    tone = 'bg-sky-100 text-sky-900 border-sky-300';
    text = `${net.pending} işlem gönderilmeyi bekliyor.`;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full border-b px-4 py-2 text-left text-sm ${tone}`}
        title="Bekleyen işlemleri göster"
      >
        {!net.online ? '📴 ' : net.failed ? '⚠️ ' : '🔄 '}
        {text}
        {(net.pending > 0 || net.failed > 0) && <span className="ml-2 underline">Göster</span>}
      </button>
      {open && <PendingOpsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PendingOpsDialog({ onClose }: { onClose: () => void }) {
  const net = useNetState();
  const { shops } = useAuth();
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = () => void listOps(getSessionUser()).then(setOps);
  useEffect(reload, [net.pending, net.failed, net.syncing]);

  const shopName = (id: string | null) => shops.find((s) => s.id === id)?.name ?? '';

  const discard = async (op: OutboxOp) => {
    const deps = await dependentsOf(op.id);
    const extra = deps.length ? `\n\nBuna bağlı ${deps.length} işlem de silinecek: ${deps.map((d) => d.label).join(', ')}` : '';
    if (!confirm(`"${op.label}" kuyruktan silinsin mi? Sunucuya hiç gönderilmeyecek.${extra}`)) return;
    await discardOp(op.id);
    reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center" onClick={onClose}>
      <div className="card max-h-[80vh] w-full max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Bekleyen işlemler</h2>
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          {net.online
            ? 'Sunucuya bağlı. Sıradaki işlemler gönderiliyor; reddedilenleri düzeltip yeniden deneyebilir ya da silebilirsiniz.'
            : 'Sunucuya şu an ulaşılamıyor. Bu işlemler bu cihazda güvende; bağlantı gelince sırasıyla ve her biri yalnız bir kez gönderilir.'}
        </p>
        {ops.length === 0 && <p className="text-sm text-slate-400">Kuyruk boş.</p>}
        <ul className="space-y-2">
          {ops.map((op) => (
            <li key={op.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {op.status === 'failed' ? '⚠️ ' : op.status === 'blocked' ? '⏸️ ' : '🕓 '}
                    {op.label}
                  </div>
                  <div className="text-xs text-slate-500">
                    {time(op.createdAt)}
                    {shopName(op.shopId) ? ` · ${shopName(op.shopId)}` : ''}
                    {summary(op)}
                  </div>
                  {op.status === 'failed' && <div className="mt-1 text-xs text-red-600">{op.error}</div>}
                  {op.status === 'blocked' && (
                    <div className="mt-1 text-xs text-amber-700">Reddedilen bir işleme bağlı; o düzelince gönderilir.</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {op.status === 'failed' && (
                    <button
                      className="btn px-2 text-xs"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        await retryOp(op.id);
                        setBusy(false);
                        reload();
                      }}
                    >
                      Yeniden dene
                    </button>
                  )}
                  <button className="btn px-2 text-xs text-red-600" onClick={() => void discard(op)}>
                    Sil
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {ops.some((o) => o.status === 'pending') && (
          <button
            className="btn-primary mt-3"
            disabled={busy || net.syncing}
            onClick={async () => {
              setBusy(true);
              await syncNow();
              setBusy(false);
              reload();
            }}
          >
            Şimdi gönder
          </button>
        )}
      </div>
    </div>
  );
}

/** Kuyruktaki işlemin kısa özeti (ad, tutar ...). */
function summary(op: OutboxOp): string {
  const b = (op.body ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof b.name === 'string') parts.push(b.name);
  if (typeof b.amount === 'number') parts.push(`${b.amount.toLocaleString('tr-TR')} ₺`);
  if (Array.isArray(b.items)) parts.push(`${b.items.length} kalem`);
  if (typeof b.status === 'string') parts.push(b.status);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}
