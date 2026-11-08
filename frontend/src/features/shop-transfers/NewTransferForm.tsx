import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  createShopTransfer,
  type CreateShopTransferInput,
  type TransferTarget,
} from '../../api/shop-transfers.api';
import { fetchPartnerGrants } from '../../api/trade.api';
import {
  fetchPlate,
  fetchPlateCosts,
  fetchPlates,
  fetchPlatesPricing,
} from '../../api/materials.api';
import { SearchSelect } from '../../components/SearchSelect';
import { useAuth } from '../../context/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { displayPlateName, plateRemainingLabel } from '../../lib/plateLabel';
import { apiErrorMessage, toast } from '../../lib/toast';
import type { Plate } from '../../types';
import {
  alertBox,
  Field,
  infoBox,
  m2Of,
  PartnerPicker,
  priceUnitLabel,
  useInvalidateAfterTransfer,
  warnBox,
} from './shared';

interface Line {
  plateId: string;
  quantity: number;
  unitPrice: number;
  widthMm?: number;
  heightMm?: number;
}

const emptyLine = (): Line => ({ plateId: '', quantity: 1, unitPrice: 0 });

/** Satılacak malzeme: arama sunucuda, liste yalnız açıkken istenir. */
export function TransferPlatePicker({
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

/**
 * Satıcı olarak başka işletmeye teklif. Kendi şubenize ya da size "otomatik onayla" yetkisi
 * vermiş işletmeye hemen tamamlanır; diğerlerinde karşı işletme onaylayana kadar stok ve cari değişmez.
 */
export function NewTransferForm({
  initialPlateId,
  onDone,
  onCancel,
}: {
  initialPlateId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { shop, can } = useAuth();
  const invalidate = useInvalidateAfterTransfer();
  const [target, setTarget] = useState<TransferTarget | undefined>();
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [picked, setPicked] = useState<Record<string, Plate>>({});

  // Hedef işletme "otomatik onayla" yetkisi vermişse teklif hemen tamamlanır (yalnız bilgi amaçlı ipucu).
  const { data: grants } = useQuery({
    queryKey: ['partners', 'grants', shop?.id],
    queryFn: fetchPartnerGrants,
    enabled: can('settings'),
  });
  const autoApproved = !!target && !!grants?.received.some((g) => g.permission === 'auto_approve' && g.shop.id === target.id);

  // Stok kartındaki "İşletmeye sat" bağlantısıyla gelindiyse malzeme seçili gelsin.
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
  const ownBlocked = !!target?.own && !target.canSell;
  const canSubmit =
    !!target &&
    !ownBlocked &&
    lines.length > 0 &&
    lines.every((l) => l.plateId && l.quantity > 0 && !lineError(l));
  const instant = !!target && (target.own || autoApproved);

  /** "20 adet Vida 4mm · 1 tabaka (1220×2440 mm)": bu satıştan stoğunuzdan düşenler. */
  const deductedText = (input: CreateShopTransferInput): string =>
    input.items
      .map((it) => {
        const plate = picked[it.plateId];
        if (!plate) return '';
        const name = displayPlateName(plate);
        if (plate.measurementType === 'area') {
          const dim = it.widthMm && it.heightMm ? ` (${it.widthMm}×${it.heightMm} mm)` : '';
          return `${it.quantity} parça${dim} ${name}`;
        }
        return `${formatNumber(it.quantity)} ${plate.measurementType === 'length' ? 'm' : 'adet'} ${name}`;
      })
      .filter(Boolean)
      .join(' · ');

  const mut = useMutation({
    mutationFn: (input: CreateShopTransferInput) => createShopTransfer(input),
    onSuccess: (t, input) => {
      if (t.status === 'pending') {
        toast.success(
          `${t.transferNo} teklifi gönderildi`,
          `"${t.toShop.name}" onaylayınca kesinleşir; o zamana kadar stoğunuz ve cariniz değişmez.`,
        );
      } else {
        toast.success(
          `${t.transferNo} kaydedildi`,
          `Stoğunuzdan düştü: ${deductedText(input)}. "${t.toShop.name}" işletmesinin stoğuna girdi; tutar o işletmenin carisine borç yazıldı.`,
        );
      }
      onDone();
    },
    onSettled: invalidate,
  });

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Başka işletmeye malzeme sat</h2>
        <p className="text-xs text-slate-500">
          Teklifi karşı işletme onaylar ya da reddeder. Onaylandığında malzeme bu işletmenin stoğundan düşer ve karşı
          işletmenin stoğuna yeni kalem olarak girer; tutar onun buradaki carisine borç yazılır.
        </p>
      </div>

      {mut.isError && (
        <p role="alert" className={alertBox}>
          {apiErrorMessage(mut.error, 'Teklif gönderilemedi.')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Alan işletme *">
          <PartnerPicker value={target?.id ?? ''} selected={target} onPick={setTarget} />
        </Field>
        <Field label="Tarih">
          <input className="input" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
        </Field>
        <Field label="Not (ops.)">
          <input className="input" placeholder="İrsaliye no vb." maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {target && (
        <p className={instant ? infoBox : warnBox}>
          {target.own
            ? 'Bu sizin kendi şubeniz: karşı onay gerekmez, kaydedince hemen tamamlanır.'
            : autoApproved
              ? `"${target.name}" size otomatik onay yetkisi vermiş: teklif hemen tamamlanır.`
              : `"${target.name}" onaylayana kadar teklif "onay bekliyor" kalır; reddederse hiçbir kayıt oluşmaz.`}
        </p>
      )}
      {ownBlocked && (
        <p className={alertBox}>Bu şubede stok girişi (satın alma yazma) yetkiniz yok; oraya satış yapamazsınız.</p>
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

      <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
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
          title={transferDate ? `Belge tarihi: ${formatDate(transferDate)}` : undefined}
          onClick={() =>
            target &&
            mut.mutate({
              toShopId: target.id,
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
          {mut.isPending
            ? 'Gönderiliyor…'
            : target
              ? instant
                ? `"${target.name}" işletmesine sat`
                : `"${target.name}" işletmesine teklif gönder`
              : 'Teklifi gönder'}
        </button>
      </div>
    </div>
  );
}
