import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { groupChipClass } from './GroupSection';
import { matchesSearch } from '../lib/search';

export interface SearchOption {
  id: string;
  label: string;
  /** Gruplama başlığı (ör. ürün türü). Verilmezse gruplanmaz. */
  group?: string;
  /**
   * İkinci seviye başlık (ör. aynı malzemenin adı). Aynı malzemenin farklı
   * parçaları tek başlık altında toplanır → uzun listeler okunabilir kalır.
   */
  subgroup?: string;
  /** İkincil satır (ör. kalan ebat / firma). */
  sublabel?: string;
  /** İkincil satır vurgusu: 'warn' → kesilmiş/kalan ebat gibi dikkat çekmesi gerekenler. */
  subtone?: 'warn';
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
  onSearchChange,
  onOpenChange,
  filterLocally = true,
  loading = false,
  stale = false,
  notice,
}: {
  options: SearchOption[];
  value: string;
  onChange: (id: string, opt?: SearchOption) => void;
  placeholder?: string;
  emptyText?: string;
  /** Yazılan arama (sunucuda arayan seçiciler için). */
  onSearchChange?: (term: string) => void;
  /** Liste açıldı/kapandı (veri yalnız açıkken istensin diye). */
  onOpenChange?: (open: boolean) => void;
  /** false → seçenekler zaten sunucuda süzülmüş; burada yeniden süzülmez. */
  filterLocally?: boolean;
  /** Sonuçlar yükleniyor (sunucu araması). */
  loading?: boolean;
  /**
   * Görünen sonuçlar yazılan aramaya ait değil (yazma bitmedi ya da yeni
   * sonuç yolda): Enter seçim yapmaz, yoksa önceki aramanın ilk kalemi
   * seçilirdi.
   */
  stale?: boolean;
  /**
   * Listenin altında sabit duran not (ör. "ilk 100 kalem gösteriliyor"):
   * sunucu sonucu kısaltıyorsa kullanıcı bunu görsün.
   */
  notice?: ReactNode;
}) {
  const [term, setTermState] = useState('');
  const [open, setOpenState] = useState(false);
  const setTerm = (t: string) => {
    setTermState(t);
    onSearchChange?.(t);
  };
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.id === value);

  // Sözcük sırası, Türkçe harf ve ondalık yazımı fark etmez ("beyaz 2,8").
  const filtered = useMemo(() => {
    if (!filterLocally || !term.trim()) return options;
    return options.filter((o) =>
      matchesSearch(`${o.label} ${o.sublabel ?? ''} ${o.group ?? ''} ${o.subgroup ?? ''}`, term),
    );
  }, [options, term, filterLocally]);

  // Gruplara ve alt gruplara ayır (sıra korunur); klavye için düz index eşlemesi
  // aşağıda render sırasında yapılır.
  const sections = useMemo(() => {
    const map = new Map<string, Map<string, SearchOption[]>>();
    for (const o of filtered) {
      const g = o.group ?? '';
      const sg = o.subgroup ?? '';
      let subs = map.get(g);
      if (!subs) {
        subs = new Map();
        map.set(g, subs);
      }
      if (!subs.has(sg)) subs.set(sg, []);
      subs.get(sg)!.push(o);
    }
    return [...map.entries()].map(
      ([group, subs]) => [group, [...subs.entries()]] as const,
    );
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
      if (stale) return;
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
          {sections.map(([group, subgroups]) => (
            <li key={group || '_'}>
              {group && (
                <div className="sticky top-0 z-10 bg-white px-2 py-1 dark:bg-slate-800">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${groupChipClass(group)}`}
                  >
                    {group}
                  </span>
                </div>
              )}
              {subgroups.map(([subgroup, opts]) => (
              <div key={subgroup || '_'}>
              {subgroup && (
                <div className="px-3 pt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {subgroup}
                  {opts.length > 1 && (
                    <span className="ml-1 font-normal text-slate-400">
                      ({opts.length} parça)
                    </span>
                  )}
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
                        className={`block w-full py-2 pl-5 pr-3 text-left text-sm ${
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
                          <span
                            className={`block text-xs ${
                              o.subtone === 'warn'
                                ? 'font-semibold text-amber-700 dark:text-amber-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {o.sublabel}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              </div>
              ))}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">
              {loading ? 'Aranıyor…' : emptyText}
            </li>
          )}
          {notice && (
            <li className="sticky bottom-0 border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {notice}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
