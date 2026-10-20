import { useMemo, useState } from 'react';
import type { MaterialBrand, MaterialColor } from '../types';
import { matchesSearch } from '../lib/search';
import { normalizeName } from '../lib/catalogKey';

export interface NewColorInput {
  name: string;
  code?: string;
  brandId?: string | null;
}

/**
 * Renk seçici: her renk adı bir satır, kodları yanında tek dokunuşla seçilen
 * çipler (Beyaz → 1001 · 2002 · kodsuz). Seçili markanın renkleri önce, genel
 * (markasız) renkler sonra gelir; başka markanın kodları soluk ve seçilemez.
 * Ad ya da kodla aranır. `onCreate` verilirse aynı yerden yeni renk/kod eklenir.
 */
export function ColorPicker({
  colors,
  brands,
  brandId,
  value,
  onChange,
  onCreate,
  creating = false,
  noneLabel = 'Renk yok',
}: {
  colors: MaterialColor[] | undefined;
  brands?: MaterialBrand[];
  /** Türün/çatının seçili markası: o markanın kodları önce gelir. */
  brandId?: string | null;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  /** Yeni renk ekler; söz (Promise) dönerse başarıda ekleme kutusu kapanır. */
  onCreate?: (input: NewColorInput) => Promise<unknown> | void;
  creating?: boolean;
  /** Seçimi kaldıran ilk çipin adı ("Renk yok", "Hepsi"). */
  noneLabel?: string;
}) {
  const [term, setTerm] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [onlyBrand, setOnlyBrand] = useState(true);
  const brandName = (id?: string | null) => (id ? brands?.find((b) => b.id === id)?.name : undefined);

  // Ada göre satırlar; satır içinde önce bu markanın, sonra genel, sonra başka markaların kodları.
  const rows = useMemo(() => {
    const list = (colors ?? []).filter((c) =>
      matchesSearch(`${c.name} ${c.code ?? ''} ${brandName(c.brandId) ?? ''}`, term),
    );
    const map = new Map<string, { name: string; items: MaterialColor[] }>();
    for (const c of list) {
      const k = normalizeName(c.name);
      const row = map.get(k);
      if (row) row.items.push(c);
      else map.set(k, { name: c.name, items: [c] });
    }
    const rank = (c: MaterialColor) => (brandId && c.brandId === brandId ? 0 : !c.brandId ? 1 : 2);
    const out = [...map.values()].map((r) => ({
      ...r,
      items: [...r.items].sort(
        (a, b) => rank(a) - rank(b) || (a.code ?? '').localeCompare(b.code ?? '', 'tr', { numeric: true }),
      ),
    }));
    // Bu markanın kodu olan renkler önce.
    return out.sort(
      (a, b) =>
        Math.min(...a.items.map(rank)) - Math.min(...b.items.map(rank)) || a.name.localeCompare(b.name, 'tr'),
    );
  }, [colors, term, brandId, brands]);

  const selected = colors?.find((c) => c.id === value);
  const usable = (c: MaterialColor) => !brandId || !c.brandId || c.brandId === brandId;
  const exists = (colors ?? []).find(
    (c) =>
      normalizeName(c.name) === normalizeName(newName) &&
      normalizeName(c.code) === normalizeName(newCode) &&
      (c.brandId ?? null) === (brandId && onlyBrand ? brandId : null),
  );

  const chip = (on: boolean, disabled = false) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
      on
        ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500'
        : disabled
          ? 'cursor-not-allowed border-dashed border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600'
          : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input min-w-0 flex-1 basis-40"
          placeholder="Renk adı ya da kodu ara…"
          aria-label="Renk ara"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button type="button" className={chip(!value)} aria-pressed={!value} onClick={() => onChange(null)}>
          {noneLabel}
        </button>
      </div>

      {selected && (
        <p className="text-xs text-slate-500">
          Seçili: <b className="text-slate-700 dark:text-slate-200">{selected.name}</b>
          {selected.code && <span className="ml-1 font-mono">{selected.code}</span>}
          {brandName(selected.brandId) && <span> · {brandName(selected.brandId)}</span>}
        </p>
      )}

      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-start gap-2 border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
            <span className="w-24 shrink-0 truncate pt-1 text-sm font-medium" title={r.name}>
              {r.name}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {r.items.map((c) => {
                const ok = usable(c);
                const other = c.brandId && c.brandId !== brandId ? brandName(c.brandId) : undefined;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={value === c.id}
                    disabled={!ok}
                    title={
                      ok
                        ? `${c.name}${c.code ? ` ${c.code}` : ''}${brandName(c.brandId) ? ` (${brandName(c.brandId)})` : ' (bütün markalar)'}`
                        : `${brandName(c.brandId) ?? 'Başka'} markasının kodu — bu markada seçilemez`
                    }
                    className={chip(value === c.id, !ok)}
                    onClick={() => onChange(c.id)}
                  >
                    {c.code ? <span className="font-mono">{c.code}</span> : 'kodsuz'}
                    {other && <span className="ml-1 opacity-70">· {other}</span>}
                    {!other && c.brandId && brandId && <span className="ml-1 opacity-70">★</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!rows.length && (
          <p className="py-2 text-center text-xs text-slate-400">
            {colors?.length ? 'Aramaya uyan renk yok.' : 'Bu türde henüz renk yok.'}
          </p>
        )}
      </div>

      {brandId && (colors ?? []).some((c) => c.brandId) && (
        <p className="text-[11px] text-slate-400">
          ★ yalnız {brandName(brandId) ?? 'bu marka'} için tanımlı kod · soluk olanlar başka markanın kodu
        </p>
      )}

      {onCreate &&
        (adding ? (
          <div className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
            <div className="flex flex-wrap gap-2">
              <input
                className="input min-w-0 flex-1 basis-36"
                placeholder="Renk adı (ör. Beyaz)"
                aria-label="Yeni renk adı"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <input
                className="input w-28 shrink-0 font-mono"
                placeholder="Kod (ör. 1001)"
                aria-label="Yeni renk kodu"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
              />
            </div>
            {brandId && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={onlyBrand} onChange={(e) => setOnlyBrand(e.target.checked)} />
                Bu kod yalnız <b>{brandName(brandId) ?? 'seçili marka'}</b> için (diğer markalarda görünmez)
              </label>
            )}
            {exists && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Bu renk ve kod zaten var —{' '}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => {
                    onChange(exists.id);
                    setAdding(false);
                  }}
                >
                  onu seç
                </button>
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={!newName.trim() || !!exists || creating}
                onClick={() =>
                  Promise.resolve(
                    onCreate({
                      name: newName.trim(),
                      code: newCode.trim() || undefined,
                      brandId: brandId && onlyBrand ? brandId : null,
                    }),
                  ).then(
                    () => {
                      setAdding(false);
                      setTerm('');
                    },
                    () => undefined,
                  )
                }
              >
                {creating ? 'Ekleniyor…' : 'Ekle ve seç'}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="text-xs font-semibold text-blue-600 underline"
            onClick={() => {
              setNewName(term && !/\d/.test(term) ? term : selected?.name ?? '');
              setNewCode(/\d/.test(term) ? term : '');
              setOnlyBrand(true);
              setAdding(true);
            }}
          >
            + Yeni renk ya da kod ekle
          </button>
        ))}
    </div>
  );
}
