/**
 * İş kolu etiketlerini çip olarak seçtirir (çoklu). Telefonda sarılır, dokunma
 * hedefi 44px. `max` aşılınca seçilmemiş çipler pasifleşir.
 */
export function LabelChips({
  labels,
  value,
  onChange,
  max,
  counts,
  disabled = false,
}: {
  labels: { id: string; name: string; description?: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  /** Süzgeçte: etiket kimliği → işletme sayısı. */
  counts?: Record<string, number>;
  disabled?: boolean;
}) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const full = max !== undefined && value.length >= max;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="İş kolları">
      {labels.map((l) => {
        const on = value.includes(l.id);
        const blocked = disabled || (!on && full);
        return (
          <button
            key={l.id}
            type="button"
            title={l.description || undefined}
            disabled={blocked}
            aria-pressed={on}
            onClick={() => toggle(l.id)}
            className={`min-h-[40px] rounded-full border px-3.5 text-sm font-medium transition disabled:opacity-40 ${
              on
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {on ? '✓ ' : ''}
            {l.name}
            {counts?.[l.id] !== undefined && (
              <span className={`ml-1.5 text-xs ${on ? 'text-blue-100' : 'text-slate-500'}`}>{counts[l.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
