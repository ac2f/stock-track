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
        compact ? 'px-4 py-6' : 'px-6 py-12'
      }`}
    >
      <div className={compact ? 'text-3xl' : 'text-5xl'} aria-hidden>
        {icon}
      </div>
      <div className="mt-3 font-semibold text-slate-700">{title}</div>
      {hint && <div className="mt-1 max-w-md text-sm text-slate-500">{hint}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
