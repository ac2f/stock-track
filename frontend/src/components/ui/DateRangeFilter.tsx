import { toIsoDate } from '../../lib/format';

/**
 * Başlangıç–bitiş tarihi ve tek dokunuşla hazır aralıklar
 * (Bugün, Dün, Bu hafta, Bu ay, Geçen ay, Son 30 gün, Bu yıl).
 * Değerler "YYYY-MM-DD"; boş = sınırsız. Hafta pazartesi başlar.
 */
export interface DateRange {
  from?: string;
  to?: string;
}

type Preset = { key: string; label: string; range: () => Required<DateRange> };

const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};

export const DATE_PRESETS: Preset[] = [
  { key: 'today', label: 'Bugün', range: () => ({ from: toIsoDate(day()), to: toIsoDate(day()) }) },
  { key: 'yesterday', label: 'Dün', range: () => ({ from: toIsoDate(day(-1)), to: toIsoDate(day(-1)) }) },
  {
    key: 'week',
    label: 'Bu hafta',
    range: () => {
      const d = day();
      const monday = day(-((d.getDay() + 6) % 7));
      return { from: toIsoDate(monday), to: toIsoDate(d) };
    },
  },
  {
    key: 'month',
    label: 'Bu ay',
    range: () => {
      const d = day();
      return { from: toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: toIsoDate(d) };
    },
  },
  {
    key: 'lastMonth',
    label: 'Geçen ay',
    range: () => {
      const d = day();
      return {
        from: toIsoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        to: toIsoDate(new Date(d.getFullYear(), d.getMonth(), 0)),
      };
    },
  },
  { key: '30d', label: 'Son 30 gün', range: () => ({ from: toIsoDate(day(-29)), to: toIsoDate(day()) }) },
  {
    key: 'year',
    label: 'Bu yıl',
    range: () => ({ from: toIsoDate(new Date(day().getFullYear(), 0, 1)), to: toIsoDate(day()) }),
  },
];

export function DateRangeFilter({
  value,
  onChange,
  fromLabel = 'Başlangıç',
  toLabel = 'Bitiş',
  presets = DATE_PRESETS.map((p) => p.key),
  hint,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  fromLabel?: string;
  toLabel?: string;
  /** Gösterilecek hazır aralıklar (anahtarlar); [] verilirse hiç gösterilmez. */
  presets?: string[];
  /** Aralık boşken altta görünen açıklama (ör. "son 1 hafta gösteriliyor"). */
  hint?: string;
}) {
  const shown = DATE_PRESETS.filter((p) => presets.includes(p.key));
  const activeKey = shown.find((p) => {
    const r = p.range();
    return r.from === value.from && r.to === value.to;
  })?.key;
  const empty = !value.from && !value.to;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="label">{fromLabel}</span>
          <input
            className="input"
            type="date"
            value={value.from ?? ''}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
          />
        </label>
        <label className="block min-w-0">
          <span className="label">{toLabel}</span>
          <input
            className="input"
            type="date"
            value={value.to ?? ''}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
          />
        </label>
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(activeKey === p.key ? {} : p.range())}
              aria-pressed={activeKey === p.key}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                activeKey === p.key
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          {!empty && (
            <button
              type="button"
              onClick={() => onChange({})}
              className="rounded-full px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline"
            >
              × Temizle
            </button>
          )}
          {empty && hint && <span className="text-xs text-slate-500">{hint}</span>}
        </div>
      )}
    </div>
  );
}
