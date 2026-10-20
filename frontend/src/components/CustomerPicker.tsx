import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCustomers } from '../api/customers.api';
import { formatMoney } from '../lib/format';
import { useDebounced } from '../hooks/useDebounced';

/**
 * Arama tabanlı müşteri seçici. Veritabanı büyüdüğünde tüm listeyi getirmek
 * yerine yazdıkça (server-side) arama yapar. Seçim yapılınca id (ve ad) yukarı
 * bildirilir; "değiştir" ile yeni arama açılır.
 * Klavye: ↑/↓ ile gezinme, Enter ile seçme, Esc ile temizleme (#9).
 */
export function CustomerPicker({
  onChange,
  placeholder = 'Müşteri ara (ad/firma)…',
  initialName,
}: {
  onChange: (id: string, name?: string) => void;
  placeholder?: string;
  initialName?: string;
}) {
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    initialName ? { id: '', name: initialName } : null,
  );
  const listRef = useRef<HTMLUListElement>(null);

  // Yazma bitince (~300 ms) aranır; yeni sonuç gelene kadar öncekiler kalır
  // (liste her harfte boşalıp dolmasın).
  const search = useDebounced(term.trim());
  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['customer-search', search],
    queryFn: () => fetchCustomers({ search, page: 1, limit: 20, sort: 'name' }),
    enabled: !picked && search.length >= 1,
    placeholderData: keepPreviousData,
  });

  const results = data?.items ?? [];
  // Gösterilen sonuçlar henüz yazılan terime ait değil (bekleme/yükleme sürüyor):
  // Enter yanlış (önceki aramadaki) müşteriyi seçmesin.
  const stale = search !== term.trim() || isPlaceholderData;
  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // id boş olsa da (düzenlemede initialName ile) ad gösterilir; "değiştir"
  // ile yeni arama açılır. Dokunulmazsa üst formdaki mevcut id korunur.
  if (picked && (picked.id || picked.name)) {
    return (
      <div
        className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-blue-300 bg-blue-50/60 px-3 py-1.5 dark:border-blue-800 dark:bg-blue-950/30"
        // Seçici bir <label> içindeyse ada tıklamak etiketin ilk düğmesini
        // ("değiştir") tetikleyip seçimi kaldırmasın. Düğmenin kendi onClick'i
        // yine çalışır.
        onClick={(e) => e.preventDefault()}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white"
            aria-hidden
          >
            ✓
          </span>
          <span className="truncate text-sm font-semibold">{picked.name}</span>
        </span>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-blue-700 underline-offset-2 hover:bg-blue-100 hover:underline dark:text-blue-300 dark:hover:bg-blue-900/40"
          title="Başka müşteri seç"
          onClick={() => {
            setPicked(null);
            setTerm('');
            onChange('');
          }}
        >
          değiştir
        </button>
      </div>
    );
  }

  const choose = (c: { id: string; name: string }) => {
    setPicked({ id: c.id, name: c.name });
    setTerm('');
    onChange(c.id, c.name);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (stale) return;
      const c = results[active];
      if (c) choose(c);
    } else if (e.key === 'Escape') {
      setTerm('');
    }
  };

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden
      >
        🔍
      </span>
      <input
        className="input pl-9 pr-9"
        placeholder={placeholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {isFetching && (
        <span
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-400 border-r-transparent"
          aria-hidden
        />
      )}
      {term.trim().length >= 1 && (
        <ul
          ref={listRef}
          className="animate-pop absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          {results.map((c, idx) => {
            const balance = Number(c.currentBalance) || 0;
            const isActive = idx === active;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-idx={idx}
                  aria-current={isActive || undefined}
                  className={`flex w-full items-center justify-between gap-3 border-l-4 px-3 py-2 text-left text-sm ${
                    isActive
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={(e) => {
                    // Seçici çoğu formda bir <label> içinde: tıklama varsayılanı
                    // engellenmezse etiket onu yeni beliren "değiştir" düğmesine
                    // iletir ve seçim anında geri alınır (fare/dokunmatik).
                    e.preventDefault();
                    choose({ id: c.id, name: c.name });
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    {(c.companyName || c.phone) && (
                      <span className="block truncate text-xs text-slate-500">
                        {[c.companyName, c.phone].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {balance !== 0 && (
                    <span
                      className={`shrink-0 whitespace-nowrap text-xs ${
                        balance > 0 ? 'text-red-600/80' : 'text-emerald-600/80'
                      }`}
                      title={balance > 0 ? 'Borç' : 'Alacak'}
                    >
                      {formatMoney(balance)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {!isFetching && data && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sonuç yok.</li>
          )}
          {isFetching && !results.length && (
            <li className="px-3 py-2 text-sm text-slate-400">Aranıyor…</li>
          )}
        </ul>
      )}
    </div>
  );
}
