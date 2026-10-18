import { useEffect, useState } from 'react';
import { dismissToast, subscribeToasts, type ToastItem } from '../lib/toast';

const TONE: Record<ToastItem['tone'], { box: string; icon: string }> = {
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100', icon: '✓' },
  error: { box: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100', icon: '!' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100', icon: '⏳' },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100', icon: 'i' },
};

const ICON_BG: Record<ToastItem['tone'], string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-sky-600 text-white',
};

/**
 * Bildirimler: telefonda üstte (alttaki menüyü örtmez), masaüstünde sağ altta.
 * Ekran okuyucular için role="status" / hatalarda role="alert".
 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  if (!items.length) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-2 z-[90] flex flex-col items-center gap-2 px-3 md:bottom-4 md:left-auto md:right-4 md:top-auto md:items-end">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`animate-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-3 py-2.5 shadow-lg ${TONE[t.tone].box}`}
        >
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ICON_BG[t.tone]}`}>
            {TONE[t.tone].icon}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{t.message}</div>
            {t.detail && <div className="mt-0.5 text-xs opacity-80">{t.detail}</div>}
          </div>
          <button
            className="-mr-1 rounded-md px-1.5 text-lg leading-none opacity-60 hover:opacity-100"
            onClick={() => dismissToast(t.id)}
            aria-label="Bildirimi kapat"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
