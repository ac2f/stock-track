import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  cancelShopTransfer,
  createShopTransfer,
  fetchShopTransfers,
  fetchTransferTargets,
  type CreateShopTransferInput,
  type ShopTransfer,
  type ShopTransferItem,
  type TransferItemState,
  type TransferUsage,
} from '../../api/shop-transfers.api';
import {
  fetchPlate,
  fetchPlateCosts,
  fetchPlates,
  fetchPlatesPricing,
} from '../../api/materials.api';
import { Can } from '../../components/Can';
import { confirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { SearchSelect } from '../../components/SearchSelect';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { usePageSize } from '../../hooks/usePageSize';
import { useUrlParam } from '../../hooks/useUrlParam';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { displayPlateName, plateRemainingLabel, stripNamePlaceholders } from '../../lib/plateLabel';
import { apiErrorMessage, toast } from '../../lib/toast';
import type { Plate } from '../../types';

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

const m2Of = (w?: number | null, h?: number | null, qty = 1): number =>
  w && h ? ((Number(w) / 1000) * (Number(h) / 1000)) * qty : 0;

/** "1220×500 mm · 0,61 m²", "3 m", "10 adet" */
function measureText(
  unit: string,
  quantity: number,
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
): string {
  if (unit === 'area' && widthMm && heightMm) {
    const pieces = quantity > 1 ? ` ×${formatNumber(quantity, 0)}` : '';
    return `${Number(widthMm)}×${Number(heightMm)} mm${pieces} · ${formatNumber(m2Of(widthMm, heightMm, quantity || 1))} m²`;
  }
  if (unit === 'length') return `${formatNumber(quantity)} m`;
  if (unit === 'weight') return `${formatNumber(quantity)} kg`;
  return `${formatNumber(quantity)} adet`;
}

function priceUnitLabel(unit?: string): string {
  if (unit === 'area') return 'TL/m²';
  if (unit === 'length') return 'TL/m';
  if (unit === 'weight') return 'TL/kg';
  return 'TL/adet';
}

const STATE_LABEL: Record<TransferItemState, string> = {
  in_stock: 'Stokta',
  partial: 'Kısmen satıldı',
  sold: 'Satıldı',
  removed: 'Stoktan çıktı',
  cancelled: 'İptal',
};

const STATE_CLASS: Record<TransferItemState, string> = {
  in_stock: 'bg-slate-100 text-slate-700',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  sold: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  removed: 'bg-slate-200 text-slate-600',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

// ── Yeni satış formu ────────────────────────────────────────────────

interface Line {
  plateId: string;
  quantity: number;
  unitPrice: number;
  widthMm?: number;
  heightMm?: number;
}

const emptyLine = (): Line => ({ plateId: '', quantity: 1, unitPrice: 0 });

/** Satılacak malzeme: arama sunucuda, liste yalnız açıkken istenir. */
function TransferPlatePicker({
  value,
  selected,
  onPick,
}: {
  value: string;
  selected?: Plate;
  onPick: (plate: Plate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const search = useDebounced(term.trim());
  const { data, isFetching } = useQuery({
    queryKey: ['plates', 'transfer-pick', search],
    queryFn: () => fetchPlates({ search: search || undefined, page: 1, limit: 100 }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const items = data?.items ?? [];
  const list = selected && !items.some((p) => p.id === selected.id) ? [selected, ...items] : items;
  return (
    <SearchSelect
      placeholder="Satılacak malzemeyi ara/seç…"
      value={value}
      options={list.map((p) => ({
        id: p.id,
        label: displayPlateName(p),
        group: p.template?.category?.name ?? 'Diğer',
        sublabel: plateRemainingLabel(p) ?? `Stok: ${formatNumber(p.quantityInStock)}`,
      }))}
      filterLocally={false}
      loading={isFetching}
      stale={term.trim() !== search || isFetching}
      onSearchChange={setTerm}
      onOpenChange={setOpen}
      onChange={(id) => {
        const p = list.find((x) => x.id === id);
        if (p) onPick(p);
      }}
    />
  );
}

function NewTransferForm({
  initialPlateId,
  onDone,
  onCancel,
}: {
  initialPlateId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const { shop } = useAuth();
  const [toShopId, setToShopId] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [picked, setPicked] = useState<Record<string, Plate>>({});

  const { data: targets, isLoading: loadingTargets } = useQuery({
    queryKey: ['shop-transfers', 'targets', shop?.id],
    queryFn: fetchTransferTargets,
  });

  // Stok kartındaki "Dükkâna sat" bağlantısıyla gelindiyse malzeme seçili gelsin.
  const { data: initialPlate } = useQuery({
    queryKey: ['plates', 'one', initialPlateId],
    queryFn: () => fetchPlate(initialPlateId!),
    enabled: !!initialPlateId,
  });
  useEffect(() => {
    if (initialPlate) pick(0, initialPlate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlate?.id]);

  const ids = [...new Set(lines.map((l) => l.plateId).filter(Boolean))].sort();
  // Fiyat ipuçları: alış maliyeti ve satış önerisi (birim başına).
  const { data: costs } = useQuery({
    queryKey: ['plate-costs', ids.join(',')],
    queryFn: () => fetchPlateCosts(ids),
    enabled: ids.length > 0,
  });
  const { data: pricing } = useQuery({
    queryKey: ['plate-pricing', 'batch', ids.join(',')],
    queryFn: () => fetchPlatesPricing(ids),
    enabled: ids.length > 0,
  });

  const patch = (i: number, p: Partial<Line>) =>
    setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  function pick(i: number, plate: Plate) {
    setPicked((m) => ({ ...m, [plate.id]: plate }));
    const area = plate.measurementType === 'area';
    patch(i, {
      plateId: plate.id,
      quantity: 1,
      // Tabakada varsayılan: kalan tabakanın tamamı; elle parça ölçüsü girilebilir.
      widthMm: area ? Number(plate.widthMm) || undefined : undefined,
      heightMm: area ? Number(plate.heightMm) || undefined : undefined,
    });
  }

  // Fiyat girilmemiş satıra ilk bilinen değeri öner: alış maliyeti, yoksa satış önerisi.
  useEffect(() => {
    setLines((arr) =>
      arr.map((l) => {
        if (!l.plateId || l.unitPrice > 0) return l;
        const suggestion = costs?.[l.plateId]?.unitCost ?? pricing?.[l.plateId]?.suggestedUnitPrice;
        return suggestion ? { ...l, unitPrice: Number(suggestion) } : l;
      }),
    );
  }, [costs, pricing]);

  const lineTotal = (l: Line): number => {
    const plate = picked[l.plateId];
    if (!plate) return 0;
    if (plate.measurementType === 'area') return m2Of(l.widthMm, l.heightMm, l.quantity || 0) * (l.unitPrice || 0);
    return (l.quantity || 0) * (l.unitPrice || 0);
  };
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);
  const target = targets?.find((t) => t.id === toShopId);

  const lineError = (l: Line): string | null => {
    const plate = picked[l.plateId];
    if (!plate) return null;
    if (!(l.quantity > 0)) return 'Miktar girin.';
    if (plate.measurementType === 'area') {
      if (!Number.isInteger(l.quantity)) return 'Parça adedi tam sayı olmalı.';
      if (!(Number(l.widthMm) > 0) || !(Number(l.heightMm) > 0)) return 'Parçanın enini ve boyunu girin.';
      const W = Number(plate.widthMm);
      const H = Number(plate.heightMm);
      if (Number(l.widthMm) > W + 1 || Number(l.heightMm) > H + 1) {
        return `Parça kalan tabakadan (${W}×${H} mm) büyük olamaz.`;
      }
    }
    return null;
  };
  const canSubmit =
    !!target?.canSell &&
    lines.length > 0 &&
    lines.every((l) => l.plateId && l.quantity > 0 && !lineError(l));

  const mut = useMutation({
    mutationFn: (input: CreateShopTransferInput) => createShopTransfer(input),
    onSuccess: (t) => {
      toast.success(
        `${t.transferNo} kaydedildi`,
        `Malzeme "${t.toShop.name}" dükkânının stoğuna girdi; tutar o dükkânın carisine borç yazıldı.`,
      );
      onDone();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['shop-transfers'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['plate-costs'] });
    },
  });

  const otherShops = targets ?? [];

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Başka dükkâna malzeme sat</h2>
        <p className="text-xs text-slate-500">
          Kaydettiğinizde malzeme bu dükkânın stoğundan düşer ve seçtiğiniz dükkânın stoğuna yeni kalem olarak girer.
          Tutar o dükkânın buradaki carisine borç yazılır; orada alış fiyatı malzemenin maliyeti olur.
        </p>
      </div>

      {mut.isError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {apiErrorMessage(mut.error, 'Satış kaydedilemedi.')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Alan dükkân *">
          <select
            className="input"
            autoFocus
            value={toShopId}
            onChange={(e) => setToShopId(e.target.value)}
            disabled={loadingTargets}
          >
            <option value="">{loadingTargets ? 'Yükleniyor…' : 'Dükkân seç…'}</option>
            {otherShops.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.canSell}>
                {t.name}
                {t.canSell ? '' : ' (stok girişi yetkiniz yok)'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tarih">
          <input className="input" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
        </Field>
        <Field label="Not (ops.)">
          <input className="input" placeholder="İrsaliye no vb." value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {!loadingTargets && otherShops.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Girebildiğiniz başka bir dükkân yok. Malzeme satmak için alan dükkânda da üyeliğiniz (stok girişi yetkisi) olmalı.
        </p>
      )}

      <div className="space-y-2">
        {lines.map((l, i) => {
          const plate = picked[l.plateId];
          const unit = plate?.measurementType;
          const area = unit === 'area';
          const cost = l.plateId ? costs?.[l.plateId] : undefined;
          const suggested = l.plateId ? pricing?.[l.plateId]?.suggestedUnitPrice : null;
          const err = lineError(l);
          return (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">Kalem {i + 1}</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn-danger-soft btn-sm"
                    aria-label={`Kalem ${i + 1} sil`}
                    onClick={() => setLines((arr) => arr.filter((_, idx) => idx !== i))}
                  >
                    Sil
                  </button>
                )}
              </div>
              <TransferPlatePicker value={l.plateId} selected={plate} onPick={(p) => pick(i, p)} />
              {plate && (
                <div className={`grid gap-2 ${area ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                  <Field label={area ? 'Parça adedi' : unit === 'length' ? 'Uzunluk (m)' : unit === 'weight' ? 'Ağırlık (kg)' : 'Adet'}>
                    <input
                      className="input text-right tabular-nums"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={area || unit === 'piece' ? '1' : '0.01'}
                      value={l.quantity}
                      onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                    />
                  </Field>
                  {area && (
                    <>
                      <Field label="En (mm)">
                        <input
                          className="input text-right tabular-nums"
                          type="number"
                          inputMode="decimal"
                          min={1}
                          value={l.widthMm ?? ''}
                          onChange={(e) => patch(i, { widthMm: Number(e.target.value) || undefined })}
                        />
                      </Field>
                      <Field label="Boy (mm)">
                        <input
                          className="input text-right tabular-nums"
                          type="number"
                          inputMode="decimal"
                          min={1}
                          value={l.heightMm ?? ''}
                          onChange={(e) => patch(i, { heightMm: Number(e.target.value) || undefined })}
                        />
                      </Field>
                    </>
                  )}
                  <Field label={`Birim fiyat (${priceUnitLabel(unit)})`}>
                    <input
                      className="input text-right tabular-nums"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={l.unitPrice}
                      onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              )}
              {plate && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {area && <span>{plateRemainingLabel(plate)}</span>}
                    {cost?.unitCost != null && (
                      <button type="button" className="underline decoration-dotted" onClick={() => patch(i, { unitPrice: Number(cost.unitCost) })}>
                        Alış: {formatMoney(cost.unitCost)}/{priceUnitLabel(unit).slice(3)}
                      </button>
                    )}
                    {suggested != null && (
                      <button type="button" className="underline decoration-dotted" onClick={() => patch(i, { unitPrice: Number(suggested) })}>
                        Satış önerisi: {formatMoney(suggested)}
                      </button>
                    )}
                  </span>
                  {lineTotal(l) > 0 && (
                    <span>
                      Kalem tutarı: <span className="font-semibold tabular-nums text-slate-700">{formatMoney(lineTotal(l))}</span>
                    </span>
                  )}
                </div>
              )}
              {err && <p className="text-xs font-medium text-red-600">{err}</p>}
            </div>
          );
        })}
      </div>

      <button type="button" className="btn-secondary" onClick={() => setLines((arr) => [...arr, emptyLine()])}>
        + Kalem ekle
      </button>

      <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2">
        <span className="text-sm font-medium text-slate-600">Toplam</span>
        <span className="text-lg font-bold tabular-nums">{formatMoney(total)}</span>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          className="btn-primary sm:min-w-[14rem]"
          disabled={!canSubmit || mut.isPending}
          onClick={() =>
            mut.mutate({
              toShopId,
              transferDate,
              note: note.trim() || undefined,
              items: lines.map((l) => {
                const area = picked[l.plateId]?.measurementType === 'area';
                return {
                  plateId: l.plateId,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  ...(area ? { widthMm: l.widthMm, heightMm: l.heightMm } : {}),
                };
              }),
            })
          }
        >
          {mut.isPending ? 'Kaydediliyor…' : target ? `"${target.name}" dükkânına sat` : 'Satışı kaydet'}
        </button>
      </div>
    </div>
  );
}

// ── Liste ───────────────────────────────────────────────────────────

function UsageLine({ u, unit, hidden }: { u: TransferUsage; unit: string; hidden: boolean }) {
  const who = u.toShopName
    ? `"${u.toShopName}" dükkânına`
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
  const remaining =
    item.state === 'partial' ? ` · kalan %${Math.round(item.remainingRatio * 100)}` : '';
  return (
    <li className="space-y-1 py-2">
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
          <span className={`badge ${STATE_CLASS[item.state]}`}>
            {STATE_LABEL[item.state]}
            {remaining}
          </span>
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

function TransferCard({ t }: { t: ShopTransfer }) {
  const qc = useQueryClient();
  const cancelled = t.status === 'cancelled';
  const cancelMut = useMutation({
    mutationFn: () => cancelShopTransfer(t.id),
    onSuccess: () => toast.success(`${t.transferNo} geri alındı`, 'Stok ve cari eski haline döndü.'),
    onError: (e) => toast.error(apiErrorMessage(e, 'Geri alınamadı.')),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['shop-transfers'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
  const { summary } = t;
  const used = summary.sold + summary.partial;
  return (
    <div className={`card space-y-2 !p-3 ${cancelled ? 'opacity-70' : ''}`} data-transfer={t.transferNo}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="font-mono">{t.transferNo}</span>
            <span className="tabular-nums text-slate-500">{formatDate(t.transferDate)}</span>
            {cancelled && <span className={`badge ${STATE_CLASS.cancelled}`}>İptal edildi</span>}
          </p>
          <p className="mt-0.5 text-sm">
            {t.direction === 'out' ? (
              <>
                <span aria-hidden>→ </span>
                <span className="font-semibold">{t.toShop.name}</span> dükkânına satıldı
              </>
            ) : (
              <>
                <span aria-hidden>← </span>
                <span className="font-semibold">{t.fromShop.name}</span> dükkânından alındı
              </>
            )}
          </p>
          {t.note && <p className="break-words text-xs text-slate-500">{t.note}</p>}
        </div>
        <span className="shrink-0 text-right text-base font-bold tabular-nums">{formatMoney(t.totalAmount, t.currency)}</span>
      </div>

      {!cancelled && (
        <p className="flex flex-wrap gap-1.5 text-xs">
          <span className="badge bg-slate-100 text-slate-700">{summary.items} kalem</span>
          {summary.sold > 0 && <span className={`badge ${STATE_CLASS.sold}`}>{summary.sold} satıldı</span>}
          {summary.partial > 0 && <span className={`badge ${STATE_CLASS.partial}`}>{summary.partial} kısmen</span>}
          {summary.inStock > 0 && <span className={`badge ${STATE_CLASS.in_stock}`}>{summary.inStock} stokta</span>}
        </p>
      )}

      <ul className="divide-y divide-slate-100 border-t border-slate-100 text-xs text-slate-600">
        {t.items.map((it) => (
          <ItemRow key={it.id} item={it} transfer={t} />
        ))}
      </ul>

      {!cancelled && used > 0 && !t.detailVisible && (
        <p className="text-xs text-slate-500">
          Müşteri adlarını ve tutarları görmek için "{t.toShop.name}" dükkânında satışları görme yetkisi gerekir.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {t.createdBy?.fullName ? `Kaydeden: ${t.createdBy.fullName}` : ''}
          {cancelled && t.cancelledAt ? ` · İptal: ${formatDate(t.cancelledAt)}` : ''}
        </span>
        {t.canCancel && (
          <button
            className="btn-danger-soft btn-sm"
            disabled={cancelMut.isPending}
            onClick={async () => {
              if (
                await confirmDialog({
                  message: `${t.transferNo} geri alınsın mı? Satış silinir, malzeme bu dükkânın stoğuna döner ve "${t.toShop.name}" dükkânındaki kalemler kaldırılır.`,
                  confirmText: 'Geri al',
                  danger: true,
                })
              )
                cancelMut.mutate();
            }}
          >
            {cancelMut.isPending ? 'Geri alınıyor…' : 'Geri al'}
          </button>
        )}
      </div>
    </div>
  );
}

type Tab = 'out' | 'in' | 'all';

/**
 * 🔁 Dükkânlar arası satış: başka dükkâna malzeme satma ve bu malzemelerin
 * karşı dükkânda kime satıldığını izleme. Giden: bu dükkânın sattıkları;
 * Gelen: bu dükkânın başka dükkânlardan aldıkları.
 */
export function ShopTransfersPage() {
  const { can } = useAuth();
  const canOut = can('sales');
  const canIn = can('purchases');
  const [tab, setTab] = useState<Tab>(canOut && canIn ? 'all' : canOut ? 'out' : 'in');
  const [showForm, setShowForm] = useState(false);
  const [initialPlateId, setInitialPlateId] = useState<string | undefined>();
  const [term, setTerm] = useState('');
  const search = useDebounced(term.trim());
  const [pageSize, setPageSize] = usePageSize('shop-transfers', 20);
  const [page, setPage] = useState(1);

  useUrlParam('new', () => {
    if (can('sales', 'write')) setShowForm(true);
  });
  useUrlParam('plate', (id) => {
    if (!can('sales', 'write')) return;
    setInitialPlateId(id);
    setShowForm(true);
  });
  useUrlParam('q', (q) => setTerm(q));
  useEffect(() => setPage(1), [search, tab]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shop-transfers', tab, search, page, pageSize],
    queryFn: () =>
      fetchShopTransfers({
        direction: tab === 'all' ? undefined : tab,
        search: search || undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'all', label: 'Tümü', show: canOut && canIn },
    { id: 'out', label: 'Sattıklarımız', show: canOut },
    { id: 'in', label: 'Aldıklarımız', show: canIn },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dükkânlar Arası Satış"
        icon="🔁"
        subtitle="Başka dükkâna malzeme satın; orada stoğa girer. Malzeme o dükkânda kime satıldıysa burada görünür."
        actions={
          <Can module="sales" level="write">
            {showForm ? (
              <button className="btn-secondary" onClick={() => setShowForm(false)}>
                Kapat
              </button>
            ) : (
              <button className="btn-primary" data-hotkey="n" title="Başka dükkâna sat (N)" onClick={() => setShowForm(true)}>
                + Başka dükkâna sat
              </button>
            )}
          </Can>
        }
      />

      {showForm && (
        <NewTransferForm
          initialPlateId={initialPlateId}
          onDone={() => {
            setShowForm(false);
            setInitialPlateId(undefined);
            setTab(canOut ? (canIn ? 'all' : 'out') : 'in');
          }}
          onCancel={() => {
            setShowForm(false);
            setInitialPlateId(undefined);
          }}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="tablist">
          {tabs
            .filter((x) => x.show)
            .map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={tab === x.id}
                className={tab === x.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => setTab(x.id)}
              >
                {x.label}
              </button>
            ))}
        </div>
        <SearchInput
          className="sm:w-72"
          value={term}
          onChange={setTerm}
          placeholder="Belge no, dükkân ya da malzeme ara…"
        />
      </div>

      {isLoading && <LoadingBlock rows={2} />}
      {isError && (
        <p role="alert" className="text-sm text-red-600">
          {apiErrorMessage(error, 'Liste alınamadı.')}
        </p>
      )}
      {data?.items.map((t) => <TransferCard key={t.id} t={t} />)}
      {data?.meta && data.meta.total > 0 && (
        <Pagination
          page={data.meta.page}
          pageCount={data.meta.pageCount}
          total={data.meta.total}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      )}
      {!isLoading && !isError && !data?.items.length && (
        <EmptyState
          icon="🔁"
          title={search ? 'Aramaya uyan kayıt yok.' : 'Henüz dükkânlar arası satış yok.'}
          hint={
            search
              ? undefined
              : 'Başka bir dükkâna malzeme sattığınızda burada görünür. Malzeme o dükkânda bir müşteriye satılırsa kime, ne zaman satıldığı da burada yazar.'
          }
          action={
            !search && !showForm ? (
              <Can module="sales" level="write">
                <button className="btn-secondary" onClick={() => setShowForm(true)}>
                  İlk satışı gir
                </button>
              </Can>
            ) : undefined
          }
        />
      )}
      <p className="text-xs text-slate-500">
        İpucu: Alan dükkânın borcu bu dükkânda o dükkân adına açılan caride izlenir; ödeme geldiğinde{' '}
        <Link className="underline" to="/payments">
          Tahsilat
        </Link>{' '}
        ekranından girin.
      </p>
    </div>
  );
}
