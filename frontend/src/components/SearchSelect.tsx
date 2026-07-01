import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchOption {
  id: string;
  label: string;
  /** Gruplama başlığı (ör. kategori adı). Verilmezse gruplanmaz. */
  group?: string;
  /** İkincil satır (ör. kalan ebat / firma). */
  sublabel?: string;
  /** #7 Zaten seçili/eklenmiş olanı farklı renkle vurgula. */
  highlight?: boolean;
}

/**
 * Aranabilir, (opsiyonel) kategoriye göre gruplanabilir açılır seçici.
 * Klavye: ↑/↓ ile gezinme, Enter ile seçme, Esc ile kapatma (#9).
 * Zaten eklenmiş kayıtlar `highlight` ile ayrı renkte gösterilir (#7).
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Ara / seç…',
  emptyText = 'Sonuç yok.',
}: {
  options: SearchOption[];
  value: string;
  onChange: (id: string, opt?: SearchOption) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const t = term.trim().toLocaleLowerCase('tr');
    if (!t) return options;
    return options.filter((o) =>
      `${o.label} ${o.sublabel ?? ''} ${o.group ?? ''}`
        .toLocaleLowerCase('tr')
        .includes(t),
    );
  }, [options, term]);

  // Gruplara ayır (sıra korunur), klavye için düz index eşlemesi ile.
  const sections = useMemo(() => {
    const map = new Map<string, SearchOption[]>();
    for (const o of filtered) {
      const g = o.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => setActive(0), [term, open]);

  // Aktif satırı görünür tut.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // Dışarı tıklayınca kapat.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTerm('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (o: SearchOption) => {
    onChange(o.id, o);
    setTerm('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setTerm('');
    }
  };

  // Düz index sayacı (gruplar arası).
  let flatIdx = -1;

  return (
    <div className="relative" ref={rootRef}>
      <input
        className="input"
        placeholder={selected ? selected.label : placeholder}
        value={open ? term : selected?.label ?? ''}
        onChange={(e) => {
          setTerm(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && (
        <ul
          ref={listRef}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          {sections.map(([group, opts]) => (
            <li key={group || '_'}>
              {group && (
                <div className="sticky top-0 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-700/70">
                  {group}
                </div>
              )}
              <ul>
                {opts.map((o) => {
                  flatIdx += 1;
                  const idx = flatIdx;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        data-idx={idx}
                        className={`block w-full px-3 py-2 text-left text-sm ${
                          idx === active ? 'bg-slate-100 dark:bg-slate-700' : ''
                        } ${
                          o.highlight
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : ''
                        } hover:bg-slate-100 dark:hover:bg-slate-700`}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => choose(o)}
                      >
                        <span className="font-medium">
                          {o.highlight ? '✓ ' : ''}
                          {o.label}
                        </span>
                        {o.sublabel && (
                          <span className="block text-xs text-slate-500">
                            {o.sublabel}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">{emptyText}</li>
          )}
        </ul>
      )}
    </div>
  );
}
