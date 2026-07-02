import type { ReactNode } from 'react';

/**
 * Renkli grup başlığı + sol renk şeridiyle grup bölümü. Aynı grup adı her
 * zaman aynı renge düşer (deterministik) → listeler arasında tutarlı ve göze
 * rahat bir ayrım sağlar. Açık/karanlık temada okunaklıdır.
 */
const PALETTE = [
  {
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
    bar: 'border-sky-400 dark:border-sky-600',
  },
  {
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    bar: 'border-emerald-400 dark:border-emerald-600',
  },
  {
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    bar: 'border-amber-400 dark:border-amber-600',
  },
  {
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
    bar: 'border-violet-400 dark:border-violet-600',
  },
  {
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
    bar: 'border-rose-400 dark:border-rose-600',
  },
  {
    chip: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
    bar: 'border-teal-400 dark:border-teal-600',
  },
  {
    chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200',
    bar: 'border-indigo-400 dark:border-indigo-600',
  },
  {
    chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
    bar: 'border-orange-400 dark:border-orange-600',
  },
];

function toneOf(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Grup adına karşılık gelen renk rozeti sınıfları (açılır liste başlıkları için). */
export function groupChipClass(key: string): string {
  return toneOf(key).chip;
}

export function GroupSection({
  title,
  count,
  countLabel = 'kayıt',
  children,
}: {
  title: string;
  count: number;
  countLabel?: string;
  children: ReactNode;
}) {
  const tone = toneOf(title);
  return (
    <div className={`space-y-2 border-l-4 pl-3 ${tone.bar}`}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${tone.chip}`}
        >
          {title}
        </span>
        <span className="text-xs text-slate-400">
          {count} {countLabel}
        </span>
      </div>
      {children}
    </div>
  );
}
