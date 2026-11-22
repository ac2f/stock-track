import { useState, type ReactNode } from 'react';

/**
 * Sayfa başlığı: solda küçük başlık, sağda eylemler. Açıklama (subtitle) yer kaplamasın diye
 * başlığın yanındaki ⓘ düğmesinin arkasındadır; tıklayınca açılır. Telefonda eylemler başlığın
 * yanında kalır, sığmazsa alta sarılır.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="flex min-w-0 items-center gap-1.5 text-lg font-semibold text-slate-900">
          {icon && (
            <span className="text-lg leading-none" aria-hidden>
              {icon}
            </span>
          )}
          <span className="min-w-0 break-words">{title}</span>
          {subtitle && (
            <button
              type="button"
              className={`ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                open
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                  : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
              }`}
              aria-label="Bu ekran ne işe yarar?"
              aria-expanded={open}
              title="Bu ekran ne işe yarar?"
              onClick={() => setOpen((o) => !o)}
            >
              i
            </button>
          )}
        </h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {subtitle && open && <p className="mt-1 max-w-3xl text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}
