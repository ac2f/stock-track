import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

const TONES = {
  emerald:
    'border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100/70 focus-visible:ring-emerald-400 dark:border-emerald-800 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40',
  blue: 'border-blue-300 bg-blue-50/60 hover:border-blue-400 hover:bg-blue-100/70 focus-visible:ring-blue-400 dark:border-blue-800 dark:bg-blue-950/30 dark:hover:bg-blue-900/40',
} as const;

const ACTION_TONES = {
  emerald: 'text-emerald-800 dark:text-emerald-300',
  blue: 'text-blue-700 dark:text-blue-300',
} as const;

/**
 * Seçilmiş bir kaydı (müşteri, ürün türü, malzeme…) özetleyen kart. TÜM KART
 * tıklanabilir: tıklayınca ya da Enter/Boşluk ile seçim yeniden açılır.
 * Sağdaki "Değiştir" yazısı yalnız ipucudur (iç içe düğme yoktur), böylece
 * küçük bir düğmeyi nişan almak gerekmez — telefonda da rahat basılır.
 */
export function SelectedCard({
  title,
  subtitle,
  icon,
  tone = 'emerald',
  actionLabel = 'Değiştir',
  onChange,
  titleHint,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof TONES;
  actionLabel?: string;
  /** Karta tıklanınca (seçimi değiştirmek için). */
  onChange: () => void;
  titleHint?: string;
  className?: string;
}) {
  const fire = (e: MouseEvent | KeyboardEvent) => {
    // Kart bir <label> içindeyse tarayıcı tıklamayı etiketin ilk denetimine
    // aktarıp seçimi bozmasın.
    e.preventDefault();
    onChange();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      title={titleHint ?? `${actionLabel}: karta tıklayın`}
      aria-label={`${typeof title === 'string' ? title : 'Seçili kayıt'} — ${actionLabel.toLowerCase()}`}
      className={`flex min-h-[44px] cursor-pointer select-none items-center gap-2 rounded-xl border p-2 outline-none transition focus-visible:ring-2 ${TONES[tone]} ${className}`}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      }}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {subtitle && <span className="block truncate text-xs text-slate-500">{subtitle}</span>}
      </span>
      <span
        className={`shrink-0 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-semibold shadow-sm dark:bg-slate-800/70 ${ACTION_TONES[tone]}`}
        aria-hidden
      >
        {actionLabel}
      </span>
    </div>
  );
}
