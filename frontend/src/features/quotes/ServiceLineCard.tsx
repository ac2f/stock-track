import { useMemo } from 'react';
import type { MeasurementType, QuoteItemInput } from '../../types';
import type { ServiceCatalog, ServiceType } from '../../api/services.api';
import { pickTier, tierRange, UNIT_SHORT } from '../../lib/services';

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

/**
 * Teklifte hizmet kalemi: hizmeti seç (gruplu liste), gerekiyorsa ölçüyü yaz (ör. harf boyu) —
 * uygun fiyat kademesi ve fiyatı kendiliğinden gelir; kademe ve fiyat elle de değiştirilebilir.
 * Onaylanınca iş olarak kuyruğa düşer.
 */
export function ServiceLineCard({
  index,
  item,
  catalog,
  onChange,
  onRemove,
}: {
  index: number;
  item: QuoteItemInput;
  catalog: ServiceCatalog | undefined;
  onChange: (patch: Partial<QuoteItemInput>) => void;
  onRemove: () => void;
}) {
  const types = useMemo(() => catalog?.groups.flatMap((g) => g.types) ?? [], [catalog]);
  const type = types.find((t) => t.id === item.serviceTypeId);
  const tier = type?.tiers.find((t) => t.id === item.serviceTierId) ?? null;
  const unit: MeasurementType = (tier?.unit ?? type?.unit ?? item.billingUnit ?? 'piece') as MeasurementType;
  const total = Math.round((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * 100) / 100;
  const measureUnit = type?.measureLabel?.match(/\(([^)]+)\)/)?.[1] ?? '';

  /** Hizmet / ölçü değişince: uyan kademe ve onun fiyatı, birimi, adı. */
  const apply = (t: ServiceType | undefined, measure: number | undefined, tierId?: string) => {
    if (!t) {
      onChange({ serviceTypeId: undefined, serviceTierId: undefined, itemName: undefined });
      return;
    }
    const chosen = tierId ? t.tiers.find((x) => x.id === tierId) ?? null : pickTier(t.tiers, t.measureLabel ? measure : undefined);
    onChange({
      serviceTypeId: t.id,
      serviceTierId: chosen?.id,
      measureValue: t.measureLabel ? measure : undefined,
      billingUnit: (chosen?.unit ?? t.unit) as MeasurementType,
      unitPrice: chosen ? Number(chosen.price) : 0,
      itemName: chosen ? `${t.name} — ${chosen.name}` : t.name,
    });
  };

  const noTier = !!type && !!type.measureLabel && item.measureValue != null && !tier;

  return (
    <div className="space-y-3 rounded-xl border border-l-4 border-slate-200 !border-l-amber-500 bg-white p-3 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {index + 1}
          </span>
          <span className="badge shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Hizmet</span>
          <span className={`truncate text-sm ${item.itemName ? 'font-medium text-slate-800' : 'italic text-slate-400'}`}>
            {item.itemName || 'Hizmet seçilmedi'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-base font-bold text-slate-900">{money.format(total)}</span>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            title="Kalemi sil"
            aria-label={`${index + 1}. kalemi sil`}
            onClick={onRemove}
          >
            ✕
          </button>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block min-w-0 sm:col-span-2">
          <span className="label">Hizmet</span>
          <select
            className="input"
            value={item.serviceTypeId ?? ''}
            onChange={(e) => apply(types.find((t) => t.id === e.target.value), item.measureValue)}
          >
            <option value="">{catalog ? 'Hizmet seçin…' : 'Yükleniyor…'}</option>
            {catalog?.groups
              .filter((g) => g.types.some((t) => t.isActive))
              .map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.types
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </label>
        {type?.measureLabel && (
          <label className="block min-w-0">
            <span className="label">{type.measureLabel}</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={item.measureValue ?? ''}
              onChange={(e) => apply(type, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </label>
        )}
        {type && type.tiers.length > 1 && (
          <label className="block min-w-0">
            <span className="label">Kademe</span>
            <select className="input" value={item.serviceTierId ?? ''} onChange={(e) => apply(type, item.measureValue, e.target.value)}>
              {!tier && <option value="">—</option>}
              {type.tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {`${t.name}${/\d/.test(t.name) ? '' : ` (${tierRange(t, measureUnit)})`} · ${money.format(Number(t.price))}/${UNIT_SHORT[(t.unit ?? type.unit) as MeasurementType]}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {noTier && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Bu ölçüye uyan kademe yok: kademeyi elle seçin ya da Hizmetler'de kademe ekleyin.
        </p>
      )}

      {type && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="block min-w-0">
            <span className="label">Miktar ({UNIT_SHORT[unit]})</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={item.quantity || ''}
              onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">Birim fiyat (₺/{UNIT_SHORT[unit]})</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={item.unitPrice || ''}
              onChange={(e) => onChange({ unitPrice: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="col-span-2 block min-w-0">
            <span className="label">Not (isteğe bağlı)</span>
            <input
              className="input"
              value={item.description ?? ''}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              placeholder="ör. vitrin harfleri"
            />
          </label>
        </div>
      )}
      <p className="text-xs text-slate-500">Teklif onaylanınca iş olarak kuyruğa düşer; tamamlanınca faturalanır.</p>
    </div>
  );
}
