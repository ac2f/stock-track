import { useState, type ReactNode } from 'react';

/**
 * Filtre kutusu. Masaüstünde hep açık; telefonda ekranı kaplamasın diye
 * "Filtreler" düğmesinin arkasında durur ve kaç filtrenin etkin olduğunu söyler.
 * `search` verilirse arama kutusu telefonda da her zaman görünür kalır.
 */
export function Filters({
  children,
  search,
  activeCount = 0,
  onClear,
  className = '',
}: {
  children?: ReactNode;
  search?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`card mb-4 space-y-3 ${className}`}>
      {(search || children) && (
        <div className="flex items-center gap-2">
          {search && <div className="min-w-0 flex-1">{search}</div>}
          {children && (
            <button
              type="button"
              className={`btn-secondary shrink-0 md:hidden ${search ? '' : 'w-full'}`}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
            >
              ⚙ Filtreler
              {activeCount > 0 && (
                <span className="rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>
              )}
              <span className="text-xs">{open ? '▲' : '▼'}</span>
            </button>
          )}
        </div>
      )}
      {children && <div className={`${open ? 'block' : 'hidden'} space-y-3 md:block`}>{children}</div>}
      {onClear && activeCount > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>{activeCount} filtre etkin</span>
          <button type="button" className="font-medium text-blue-600 hover:underline" onClick={onClear}>
            Filtreleri temizle
          </button>
        </div>
      )}
    </div>
  );
}
