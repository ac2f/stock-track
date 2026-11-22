import { useEffect, useId, useRef, useState } from 'react';

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * "⋯" düğmesi ve açılan işlem listesi: dar ekranda ikincil işlemler kartı satır satır uzatmasın diye.
 * Esc ya da dışarı tıklamak kapatır; ↑/↓ öğeler arasında gezer, açılınca ilk öğe odaklanır.
 */
export function MoreMenu({ items, label = 'Diğer işlemler', className = '' }: { items: MoreMenuItem[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      btn.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  };

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className="btn-secondary btn-sm min-w-[40px] px-2 text-base leading-none"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className="animate-pop absolute right-0 z-30 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:opacity-50 dark:hover:bg-slate-700 dark:focus-visible:bg-slate-700 ${
                it.danger ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'
              }`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
