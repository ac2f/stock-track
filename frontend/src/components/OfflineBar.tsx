import { useEffect, useState } from 'react';
import { useNetState } from '../offline/network';
import { listOps, type OutboxOp } from '../offline/outbox';
import { getSessionUser } from '../offline/session';
import { dependentsOf, discardOp, retryOp, syncNow } from '../offline/sync';
import { useAuth } from '../context/AuthContext';
import { confirmDialog } from './ConfirmDialog';
import { EmptyState } from './ui/EmptyState';
import { Spinner } from './ui/Loading';
import { formatMoney } from '../lib/format';

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

  // Renk ve simge durumu bir bakışta söyler: sarı çevrimdışı, mavi gönderiliyor, kırmızı hata.
  let tone =
    'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200/70 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100';
  let icon = '📴';
  let text: string;
  if (!net.online) {
    text = net.pending
      ? `Çevrimdışı — ${net.pending} işlem bu cihazda bekliyor; bağlantı gelince gönderilecek.`
      : 'Çevrimdışı — son kaydedilen veriler gösteriliyor. Müşteri, tahsilat, teklif, satış ve iş kayıtları sıraya alınır.';
  } else if (net.syncing) {
    tone =
      'border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200/70 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-100';
    icon = '🔄';
    text = `Eşzamanlanıyor… (${net.pending} işlem)`;
  } else if (net.failed) {
    tone =
      'border-red-300 bg-red-100 text-red-900 hover:bg-red-200/70 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100';
    icon = '⚠️';
    text = `${net.failed} işlem sunucuya işlenemedi — bakmanız gerekiyor.`;
  } else {
    tone =
      'border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200/70 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-100';
    icon = '🔄';
    text = `${net.pending} işlem gönderilmeyi bekliyor.`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`no-print flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm transition sm:px-4 ${tone}`}
        title="Bekleyen işlemleri göster"
        aria-haspopup="dialog"
      >
        {net.syncing ? (
          <Spinner className="shrink-0" />
        ) : (
          <span className="shrink-0 text-base leading-none" aria-hidden>
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">{text}</span>
        {(net.pending > 0 || net.failed > 0) && (
          <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold shadow-sm dark:bg-slate-900/40">
            Göster
          </span>
        )}
      </button>
      {open && <PendingOpsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** Kuyruktaki işlemin durumu: renkli rozet + kısa ad. */
const STATUS: Record<OutboxOp['status'], { label: string; cls: string }> = {
  pending: { label: 'Sırada', cls: 'bg-sky-100 text-sky-800' },
  failed: { label: 'Reddedildi', cls: 'bg-red-100 text-red-800' },
  blocked: { label: 'Bekletiliyor', cls: 'bg-amber-100 text-amber-800' },
};

function PendingOpsDialog({ onClose }: { onClose: () => void }) {
  const net = useNetState();
  const { shops } = useAuth();
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = () => void listOps(getSessionUser()).then(setOps);
  useEffect(reload, [net.pending, net.failed, net.syncing]);

  // Esc pencereyi kapatır; üstte onay penceresi açıksa Esc yalnız onu kapatsın.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="alertdialog"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shopName = (id: string | null) => shops.find((s) => s.id === id)?.name ?? '';

  const discard = async (op: OutboxOp) => {
    const deps = await dependentsOf(op.id);
    const extra = deps.length ? `\n\nBuna bağlı ${deps.length} işlem de silinecek: ${deps.map((d) => d.label).join(', ')}` : '';
    const ok = await confirmDialog({
      title: 'Kuyruktan silinsin mi?',
      message: `"${op.label}" kuyruktan silinsin mi? Sunucuya hiç gönderilmeyecek.${extra}`,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    await discardOp(op.id);
    reload();
  };

  const failedCount = ops.filter((o) => o.status === 'failed').length;

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="st-outbox-title"
        className="animate-pop flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
              net.online ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
            }`}
            aria-hidden
          >
            {net.online ? '🔄' : '📴'}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="st-outbox-title" className="text-base font-semibold">
              Bekleyen işlemler
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`badge ${net.online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {net.online ? 'Sunucuya bağlı' : 'Çevrimdışı'}
              </span>
              {ops.length > 0 && <span className="badge bg-slate-100 text-slate-700">{ops.length} işlem</span>}
              {failedCount > 0 && <span className="badge bg-red-100 text-red-800">{failedCount} reddedildi</span>}
            </div>
          </div>
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={onClose}>
            Kapat
          </button>
        </div>

        {/* İçerik */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5">
          <p className="text-sm text-slate-500">
            {net.online
              ? 'Sunucuya bağlı. Sıradaki işlemler gönderiliyor; reddedilenleri düzeltip yeniden deneyebilir ya da silebilirsiniz.'
              : 'Sunucuya şu an ulaşılamıyor. Bu işlemler bu cihazda güvende; bağlantı gelince sırasıyla ve her biri yalnız bir kez gönderilir.'}
          </p>
          {ops.length === 0 && (
            <EmptyState compact icon="✅" title="Kuyruk boş." hint="Gönderilmeyi bekleyen işlem yok." />
          )}
          <ul className="space-y-2">
            {ops.map((op) => {
              const st = STATUS[op.status] ?? STATUS.pending;
              return (
                <li
                  key={op.id}
                  className={`rounded-xl border p-3 text-sm ${
                    op.status === 'failed' ? 'border-red-200 bg-red-50/60 dark:bg-red-950/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                        <span className="break-words font-medium">{op.label}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {time(op.createdAt)}
                        {shopName(op.shopId) ? ` · ${shopName(op.shopId)}` : ''}
                        {summary(op)}
                      </div>
                      {op.status === 'failed' && (
                        <div className="mt-1.5 break-words rounded-lg bg-red-100/70 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          {op.error}
                        </div>
                      )}
                      {op.status === 'blocked' && (
                        <div className="mt-1 text-xs text-amber-700">Reddedilen bir işleme bağlı; o düzelince gönderilir.</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {op.status === 'failed' && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            await retryOp(op.id);
                            setBusy(false);
                            reload();
                          }}
                        >
                          ↻ Yeniden dene
                        </button>
                      )}
                      <button type="button" className="btn-danger-soft btn-sm" onClick={() => void discard(op)}>
                        Sil
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Alt eylem */}
        {ops.some((o) => o.status === 'pending') && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
            {!net.online && (
              <span className="mr-auto text-xs text-slate-500">Bağlantı yokken gönderim denenir, olmazsa sırada kalır.</span>
            )}
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy || net.syncing}
              onClick={async () => {
                setBusy(true);
                await syncNow();
                setBusy(false);
                reload();
              }}
            >
              {(busy || net.syncing) && <Spinner className="h-3.5 w-3.5" />}
              Şimdi gönder
            </button>
          </div>
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
  if (typeof b.amount === 'number') parts.push(formatMoney(b.amount, typeof b.currency === 'string' ? b.currency : 'TRY'));
  if (Array.isArray(b.items)) parts.push(`${b.items.length} kalem`);
  if (typeof b.status === 'string') parts.push(b.status);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}
