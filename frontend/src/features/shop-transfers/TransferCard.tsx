import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  approveShopTransfer,
  cancelShopTransfer,
  rejectShopTransfer,
  type ShopTransfer,
  type ShopTransferItem,
  type TransferStatus,
  type TransferUsage,
} from '../../api/shop-transfers.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatMoney } from '../../lib/format';
import { stripNamePlaceholders } from '../../lib/plateLabel';
import { apiErrorMessage, toast } from '../../lib/toast';
import { measureText, STATE_CLASS, STATE_LABEL, useInvalidateAfterTransfer } from './shared';

const STATUS_LABEL: Record<TransferStatus, string> = {
  pending: 'Onay bekliyor',
  completed: 'Tamamlandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
};

const STATUS_CLASS: Record<TransferStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-slate-200 text-slate-600',
};

function UsageLine({ u, unit, hidden }: { u: TransferUsage; unit: string; hidden: boolean }) {
  const who = u.toShopName
    ? `"${u.toShopName}" işletmesine`
    : u.customerName
      ? `${u.customerName}`
      : hidden
        ? 'bir müşteriye'
        : 'müşteri belirtilmemiş';
  const measure = measureText(unit, u.quantity, u.widthMm, u.heightMm);
  if (u.kind === 'processing') {
    const pending = u.status === 'pending' || u.status === 'in_progress';
    return (
      <li className="flex flex-wrap items-baseline gap-x-1.5">
        <span aria-hidden>🛠️</span>
        <span className="tabular-nums">{formatDate(u.at)}</span>
        <span>
          · {pending ? 'İş kuyruğunda' : 'İşlendi'} — {who} · {measure}
        </span>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5">
      <span aria-hidden>🧾</span>
      <span className="tabular-nums">{formatDate(u.at)}</span>
      <span>
        · <span className="font-medium text-slate-700">{who}</span> satıldı · {measure}
      </span>
      {u.amount != null && <span className="font-medium tabular-nums">· {formatMoney(u.amount, u.currency)}</span>}
    </li>
  );
}

function ItemRow({ item, transfer }: { item: ShopTransferItem; transfer: ShopTransfer }) {
  const remaining = item.state === 'partial' ? ` · kalan %${Math.round(item.remainingRatio * 100)}` : '';
  return (
    <li className="space-y-0.5 py-1">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="font-medium text-slate-700">{stripNamePlaceholders(item.plateName) || 'Malzeme'}</span>
          {item.categoryName && <span className="text-slate-400"> · {item.categoryName}</span>}
          <span className="block tabular-nums text-slate-500">
            {measureText(item.measurementType, item.quantity, item.widthMm, item.heightMm)} ×{' '}
            {formatMoney(item.unitPrice, transfer.currency)}
            {item.measurementType === 'area' ? '/m²' : ''}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-medium tabular-nums">{formatMoney(item.lineTotal, transfer.currency)}</span>
          {/* Onay bekleyen ya da reddedilen belgede kalem durumu anlamsız: belge rozeti yeter. */}
          {transfer.status !== 'rejected' && (
            <span className={`badge ${STATE_CLASS[item.state]}`}>
              {STATE_LABEL[item.state]}
              {remaining}
            </span>
          )}
        </span>
      </div>
      {item.usages.length > 0 && (
        <ul className="ml-1 space-y-0.5 border-l-2 border-emerald-200 pl-2 text-slate-600 dark:border-emerald-900">
          {item.usages.map((u, idx) => (
            <UsageLine key={idx} u={u} unit={item.measurementType} hidden={!transfer.detailVisible} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Not isteyen karar kutusu (ret / geri alma talebi): "Reddet"e basınca açılır. */
function NoteAction({
  label,
  placeholder,
  confirmLabel,
  busy,
  danger = true,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  confirmLabel: string;
  busy: boolean;
  danger?: boolean;
  onSubmit: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!open) {
    return (
      <button type="button" className={danger ? 'btn-danger-soft btn-sm' : 'btn-secondary btn-sm'} disabled={busy} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <input
        className="input min-w-0 flex-1"
        autoFocus
        maxLength={300}
        placeholder={placeholder}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') onSubmit(note);
        }}
      />
      <div className="flex gap-2">
        <button type="button" className={danger ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} disabled={busy} onClick={() => onSubmit(note)}>
          {busy ? 'Gönderiliyor…' : confirmLabel}
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

export function TransferCard({ t }: { t: ShopTransfer }) {
  const { can } = useAuth();
  const invalidate = useInvalidateAfterTransfer();
  const other = t.direction === 'out' ? t.toShop : t.fromShop;
  const myModule = t.direction === 'out' ? 'sales' : 'purchases';
  const canAct = can(myModule, 'write');
  const dead = t.status === 'cancelled' || t.status === 'rejected';

  const approve = useMutation({
    mutationFn: (note?: string) => approveShopTransfer(t.id, note),
    onSuccess: (res) =>
      toast.success(
        res.status === 'cancelled' ? `${t.transferNo} geri alındı` : `${t.transferNo} onaylandı`,
        res.status === 'cancelled'
          ? 'Stok ve cari eski haline döndü.'
          : t.direction === 'out'
            ? `Malzeme stoğunuzdan düştü; tutar "${other.name}" işletmesinin carisine borç yazıldı.`
            : `Malzeme stoğunuza girdi; tutar "${other.name}" işletmesine borcunuz olarak yazıldı.`,
      ),
    onError: (e) => toast.error(apiErrorMessage(e, 'Onaylanamadı.')),
    onSettled: invalidate,
  });
  const reject = useMutation({
    mutationFn: (note?: string) => rejectShopTransfer(t.id, note),
    onSuccess: () => toast.success(`${t.transferNo} reddedildi`, 'Stok ve cari değişmedi.'),
    onError: (e) => toast.error(apiErrorMessage(e, 'Reddedilemedi.')),
    onSettled: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (note?: string) => cancelShopTransfer(t.id, note),
    onSuccess: (res) => {
      if (res.status === 'cancelled') toast.success(`${t.transferNo} geri alındı`, 'Stok ve cari eski haline döndü.');
      else if (res.cancelRequest) toast.success('Geri alma talebi gönderildi', `"${other.name}" onaylayınca belge geri alınır.`);
      else toast.success('Talep geri çekildi');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'İşlem yapılamadı.')),
    onSettled: invalidate,
  });
  const busy = approve.isPending || reject.isPending || cancel.isPending;

  const { summary } = t;
  const used = summary.sold + summary.partial;
  const cr = t.cancelRequest;

  return (
    <div className={`card space-y-1.5 !p-2.5 ${dead ? 'opacity-80' : ''}`} data-transfer={t.transferNo} data-status={t.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="font-mono">{t.transferNo}</span>
            <span className="tabular-nums text-slate-500">{formatDate(t.transferDate)}</span>
            <span className={`badge ${STATUS_CLASS[t.status]}`}>{STATUS_LABEL[t.status]}</span>
            {t.status === 'completed' && t.autoApproved && <span className="badge bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Otomatik onaylandı</span>}
          </p>
          <p className="mt-0.5 text-sm">
            {t.direction === 'out' ? (
              <>
                <span aria-hidden>→ </span>
                <span className="font-semibold">{t.toShop.name}</span> işletmesine {t.status === 'pending' ? 'satış teklifi' : 'satıldı'}
              </>
            ) : (
              <>
                <span aria-hidden>← </span>
                <span className="font-semibold">{t.fromShop.name}</span> işletmesinden {t.status === 'pending' ? 'alım' : 'alındı'}
              </>
            )}
            <span className="text-xs text-slate-500">
              {' '}
              · {t.initiatedByMe ? 'siz başlattınız' : `${other.name} başlattı`}
            </span>
          </p>
          {t.note && <p className="break-words text-xs text-slate-500">{t.note}</p>}
        </div>
        <span className="shrink-0 text-right text-base font-bold tabular-nums">{formatMoney(t.totalAmount, t.currency)}</span>
      </div>

      {t.status === 'completed' && (
        <p className="flex flex-wrap gap-1.5 text-xs">
          <span className="badge bg-slate-100 text-slate-700">{summary.items} kalem</span>
          {summary.sold > 0 && <span className={`badge ${STATE_CLASS.sold}`}>{summary.sold} satıldı</span>}
          {summary.partial > 0 && <span className={`badge ${STATE_CLASS.partial}`}>{summary.partial} kısmen</span>}
          {summary.inStock > 0 && <span className={`badge ${STATE_CLASS.in_stock}`}>{summary.inStock} stokta</span>}
        </p>
      )}

      <ul className="divide-y divide-slate-100 border-t border-slate-100 text-xs text-slate-600 dark:divide-slate-700 dark:border-slate-700">
        {t.items.map((it) => (
          <ItemRow key={it.id} item={it} transfer={t} />
        ))}
      </ul>

      {t.status === 'completed' && used > 0 && !t.detailVisible && (
        <p className="text-xs text-slate-500">
          Müşteri adlarını ve tutarları görmek için "{t.toShop.name}" işletmesinde satışları görme yetkisi gerekir.
        </p>
      )}
      {t.status === 'completed' && t.direction === 'out' && !t.trackingVisible && (
        <p className="text-xs text-slate-500">
          Malzeme artık "{t.toShop.name}" işletmesinin stoğunda; onun sonraki satış ve işlemleri sizin tarafınızda görünmez.
        </p>
      )}
      {t.status === 'rejected' && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {t.initiatedByMe ? `"${other.name}"` : 'Siz'} reddetti{t.decidedAt ? ` · ${formatDate(t.decidedAt)}` : ''}.
          {t.decisionNote ? ` Not: ${t.decisionNote}` : ''} Stok ve cari değişmedi.
        </p>
      )}

      {/* Karar bekleyen teklif/talep */}
      {t.status === 'pending' && t.canDecide && (
        <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {t.direction === 'out'
              ? `"${other.name}" sizden bu malzemeleri satın almak istiyor.`
              : `"${other.name}" size bu malzemeleri satmak istiyor.`}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {t.direction === 'out'
              ? 'Onaylarsanız malzeme stoğunuzdan düşer ve tutar onun carisine borç yazılır.'
              : 'Onaylarsanız malzeme stoğunuza girer ve tutar ona borcunuz olarak yazılır.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => approve.mutate(undefined)}>
              {approve.isPending ? 'Onaylanıyor…' : 'Onayla'}
            </button>
            <NoteAction
              label="Reddet"
              placeholder="Ret nedeni (ops.)"
              confirmLabel="Reddet"
              busy={reject.isPending}
              onSubmit={(note) => reject.mutate(note)}
            />
          </div>
        </div>
      )}
      {t.status === 'pending' && !t.canDecide && !t.canWithdraw && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t.initiatedByMe
            ? `"${other.name}" onaylayana kadar bekliyor.`
            : `Karar bekliyor. Onaylamak ya da reddetmek için ${t.direction === 'out' ? 'satış' : 'satın alma'} yazma izni gerekir.`}
        </p>
      )}
      {t.status === 'pending' && t.canWithdraw && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <span>"{other.name}" onayı bekleniyor; o zamana kadar stok ve cari değişmez.</span>
          <button
            type="button"
            className="btn-danger-soft btn-sm"
            disabled={busy}
            onClick={async () => {
              if (await confirmDialog({ message: `${t.transferNo} teklifi geri çekilsin mi?`, confirmText: 'Geri çek', danger: true })) cancel.mutate(undefined);
            }}
          >
            {cancel.isPending ? 'Çekiliyor…' : 'Geri çek'}
          </button>
        </div>
      )}

      {/* Tamamlanmış belgenin geri alınması */}
      {t.status === 'completed' && cr && (
        <div className="space-y-1.5 rounded-lg border border-orange-300 bg-orange-50 p-2.5 dark:border-orange-800 dark:bg-orange-950/30">
          {cr.byMe ? (
            <>
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                Geri alma talebiniz "{other.name}" onayını bekliyor.
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busy || !canAct}
                onClick={() => cancel.mutate(undefined)}
              >
                {cancel.isPending ? 'Çekiliyor…' : 'Talebi geri çek'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                "{cr.byShopName}" bu belgenin geri alınmasını istiyor{cr.note ? `: ${cr.note}` : '.'}
              </p>
              <p className="text-xs text-orange-800 dark:text-orange-300">
                Onaylarsanız belge iptal olur; stok ve cari iki tarafta da eski haline döner.
              </p>
              {canAct ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirmDialog({ message: `${t.transferNo} geri alınsın mı? Stok ve cari eski haline döner.`, confirmText: 'Geri alınmasını onayla', danger: true })) approve.mutate(undefined);
                    }}
                  >
                    {approve.isPending ? 'Onaylanıyor…' : 'Geri almayı onayla'}
                  </button>
                  <NoteAction
                    label="Reddet"
                    placeholder="Ret nedeni (ops.)"
                    confirmLabel="Reddet"
                    busy={reject.isPending}
                    onSubmit={(note) => reject.mutate(note)}
                  />
                </div>
              ) : (
                <p className="text-xs text-orange-800">Karar için {t.direction === 'out' ? 'satış' : 'satın alma'} yazma izni gerekir.</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {t.createdBy?.fullName ? `Kaydeden: ${t.createdBy.fullName}` : ''}
          {t.status === 'cancelled' && t.cancelledAt ? ` · İptal: ${formatDate(t.cancelledAt)}` : ''}
          {t.status === 'completed' && t.decidedAt && !t.autoApproved ? ` · Onay: ${formatDate(t.decidedAt)}` : ''}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {t.canCancel && (
            <button
              className="btn-danger-soft btn-sm"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirmDialog({
                    message: `${t.transferNo} geri alınsın mı? Satış silinir, malzeme satıcının stoğuna döner ve alıcıdaki kalemler kaldırılır.`,
                    confirmText: 'Geri al',
                    danger: true,
                  })
                )
                  cancel.mutate(undefined);
              }}
            >
              {cancel.isPending ? 'Geri alınıyor…' : 'Geri al'}
            </button>
          )}
          {t.status === 'completed' && t.canRequestCancel && (
            <NoteAction
              label="Geri alma talebi aç"
              placeholder={`"${other.name}" için not (ops.)`}
              confirmLabel="Talep gönder"
              busy={cancel.isPending}
              onSubmit={(note) => cancel.mutate(note)}
            />
          )}
        </span>
      </div>
    </div>
  );
}
