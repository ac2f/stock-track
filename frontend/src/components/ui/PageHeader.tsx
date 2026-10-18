import type { ReactNode } from 'react';

/**
 * Sayfa başlığı: solda başlık (ve kısa açıklama), sağda eylemler. Telefonda
 * eylemler başlığın altına iner ve satır satır sarılır; taşma olmaz.
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
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
          {icon && (
            <span className="text-2xl leading-none" aria-hidden>
              {icon}
            </span>
          )}
          <span className="min-w-0 break-words">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </div>
  );
}
