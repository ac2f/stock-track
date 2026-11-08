import type { ReactNode } from 'react';

/** Liste boşken: simge, kısa açıklama ve (varsa) ilk adımı başlatan düğme. */
export function EmptyState({
  icon = '📭',
  title,
  hint,
  action,
  compact = false,
}: {
  icon?: string;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-center dark:bg-slate-800/40 ${
        compact ? 'px-3 py-4' : 'px-4 py-7'
      }`}
    >
      <div className={compact ? 'text-2xl' : 'text-3xl'} aria-hidden>
        {icon}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-slate-700">{title}</div>
      {hint && <div className="mt-0.5 max-w-md text-xs text-slate-500">{hint}</div>}
      {action && <div className="mt-2.5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
