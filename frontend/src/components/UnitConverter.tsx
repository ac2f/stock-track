import { useState } from 'react';

/**
 * Küçük birim çevirici: mm ⇄ cm ⇄ m. Ölçü girilen formlarda (stok ekleme/düzenleme)
 * hızlı çevrim için. Değer + birim girilir; diğer birimlerdeki karşılıkları anında
 * gösterilir (kopyala-yapıştır gerektirmeyecek kadar okunaklı).
 */
export function UnitConverter() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'mm' | 'cm' | 'm'>('cm');

  const n = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(n);
  const mm = unit === 'mm' ? n : unit === 'cm' ? n * 10 : n * 1000;

  const fmt = (v: number) =>
    v.toLocaleString('tr-TR', { maximumFractionDigits: 4 });

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        className="flex w-full items-center justify-between px-2 py-1.5 text-xs text-slate-500"
        onClick={() => setOpen((o) => !o)}
      >
        <span>📐 Birim çevirici (mm ⇄ cm ⇄ m)</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-slate-200 p-2 dark:border-slate-700">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="text"
              inputMode="decimal"
              placeholder="Değer (örn. 125,5)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <select
              className="input w-20"
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'mm' | 'cm' | 'm')}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </div>
          {valid ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              = {fmt(mm)} mm · {fmt(mm / 10)} cm · {fmt(mm / 1000)} m
            </p>
          ) : (
            <p className="text-xs text-slate-400">Değer girin…</p>
          )}
        </div>
      )}
    </div>
  );
}
