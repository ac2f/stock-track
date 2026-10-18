import { useMemo, useState } from 'react';

/**
 * Kategori içinde hızlı süzme: marka, kalınlık, ebat, renk gibi özellikler
 * için tek dokunuşluk çipler. Her çipte o seçimle kaç sonuç kalacağı yazar;
 * diğer seçimlerle sonuç vermeyecek değerler soluk görünür. Aynı çipe tekrar
 * dokunmak seçimi kaldırır.
 */
export interface Facet<T> {
  key: string;
  label: string;
  /** Kalemin bu özellikteki değeri (görünen metin); yoksa null. */
  value: (item: T) => string | null | undefined;
  /** Değer sırası; verilmezse sayılar küçükten büyüğe, metinler alfabetik. */
  sort?: (a: string, b: string) => number;
}

export interface FacetOption {
  value: string;
  count: number;
}

export interface FacetState<T> {
  selected: Record<string, string | undefined>;
  toggle: (key: string, value: string) => void;
  clear: () => void;
  /** Seçimlere uyan kalemler. */
  filtered: T[];
  /** Her özelliğin değerleri ve diğer seçimlerle kalan sayıları. */
  options: Record<string, FacetOption[]>;
  activeCount: number;
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

function defaultSort(a: string, b: string): number {
  const na = parseFloat(a.replace(',', '.'));
  const nb = parseFloat(b.replace(',', '.'));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return collator.compare(a, b);
}

export function useFacets<T>(items: T[], facets: Facet<T>[]): FacetState<T> {
  const [selected, setSelected] = useState<Record<string, string | undefined>>({});

  const passes = (item: T, except?: string) =>
    facets.every((f) => {
      if (f.key === except) return true;
      const want = selected[f.key];
      return !want || (f.value(item) ?? '') === want;
    });

  const filtered = useMemo(
    () => items.filter((it) => passes(it)),
    [items, selected, facets],
  );

  const options = useMemo(() => {
    const out: Record<string, FacetOption[]> = {};
    for (const f of facets) {
      const counts = new Map<string, number>();
      // Tüm değerler listelenir; sayı, diğer seçimlere uyanlardan gelir.
      for (const it of items) {
        const v = f.value(it);
        if (v && !counts.has(v)) counts.set(v, 0);
      }
      for (const it of items) {
        if (!passes(it, f.key)) continue;
        const v = f.value(it);
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[f.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => (f.sort ?? defaultSort)(a.value, b.value));
    }
    return out;
  }, [items, selected, facets]);

  return {
    selected,
    toggle: (key, value) =>
      setSelected((s) => ({ ...s, [key]: s[key] === value ? undefined : value })),
    clear: () => setSelected({}),
    filtered,
    options,
    activeCount: Object.values(selected).filter(Boolean).length,
  };
}

/**
 * Özellik çip satırları. Tek değeri olan özellik gösterilmez (süzecek bir
 * şey yok); seçili değer her zaman görünür kalır.
 */
export function FacetChips<T>({
  facets,
  state,
  className = '',
  hideClear = false,
}: {
  facets: Facet<T>[];
  state: FacetState<T>;
  className?: string;
  /** Çevreleyen kutunun kendi "temizle" düğmesi varsa gizle. */
  hideClear?: boolean;
}) {
  const rows = facets.filter(
    (f) => (state.options[f.key]?.length ?? 0) > 1 || state.selected[f.key],
  );
  if (!rows.length) return null;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {rows.map((f) => (
        <div key={f.key} className="flex items-start gap-2">
          <span className="w-16 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {f.label}
          </span>
          <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible">
            {state.options[f.key].map((o) => {
              const on = state.selected[f.key] === o.value;
              const empty = !on && o.count === 0;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => state.toggle(f.key, o.value)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    on
                      ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500'
                      : empty
                        ? 'border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {o.value}
                  <span className={`ml-1 ${on ? 'text-blue-100' : 'text-slate-400'}`}>{o.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!hideClear && state.activeCount > 0 && (
        <button type="button" className="text-xs font-medium text-blue-600 underline" onClick={state.clear}>
          Süzgeçleri temizle
        </button>
      )}
    </div>
  );
}
