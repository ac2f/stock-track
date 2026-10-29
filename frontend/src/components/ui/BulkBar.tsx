import { useEffect, useRef, type ReactNode } from 'react';
import type { SelState } from '../../lib/selection';

/**
 * Toplu seçim onay kutusu: 44 px dokunma alanı, "bir kısmı seçili" durumu
 * (indeterminate) ve ekran okuyucu etiketi. Kartın içinde ya da grup başlığında
 * kullanılır.
 */
export function SelectBox({
  state,
  onChange,
  label,
  className = '',
}: {
  state: SelState | boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const s: SelState = state === true ? 'all' : state === false ? 'none' : state;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = s === 'some';
  }, [s]);
  return (
    <label
      className={`-m-2 flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center ${className}`}
      title={label}
      // Kart/başlık düğmesi gibi tıklanabilir bir üst öğenin içinde de çalışsın.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        type="checkbox"
        className="h-5 w-5"
        checked={s === 'all'}
        onChange={onChange}
        aria-label={label}
      />
    </label>
  );
}

/**
 * Ekranın altına yapışan toplu işlem çubuğu: kaç kayıt seçili, "seçimi temizle"
 * ve çubuğun eylemleri (children). Telefonda alt menünün üstünde durur.
 */
export function BulkBar({
  title,
  onClear,
  children,
  label = 'Toplu işlem',
}: {
  title: ReactNode;
  onClear: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className="sticky bottom-20 z-20 max-h-[65vh] space-y-2 overflow-y-auto rounded-2xl border border-blue-300 bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-2 dark:border-blue-800 dark:bg-slate-900/95"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{title}</p>
        <button type="button" className="ml-auto text-xs text-slate-500 underline" onClick={onClear}>
          Seçimi temizle
        </button>
      </div>
      {children}
    </div>
  );
}
