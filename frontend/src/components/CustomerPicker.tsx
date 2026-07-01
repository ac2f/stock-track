import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCustomers } from '../api/customers.api';

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

  const { data, isFetching } = useQuery({
    queryKey: ['customer-search', term],
    queryFn: () =>
      fetchCustomers({ search: term || undefined, page: 1, limit: 20, sort: 'name' }),
    enabled: !picked && term.trim().length >= 1,
  });

  const results = data?.items ?? [];
  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // id boş olsa da (düzenlemede initialName ile) ad gösterilir; "değiştir"
  // ile yeni arama açılır. Dokunulmazsa üst formdaki mevcut id korunur.
  if (picked && (picked.id || picked.name)) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600">
        <span className="text-sm font-medium">{picked.name}</span>
        <button
          type="button"
          className="text-xs text-slate-500 underline"
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
      const c = results[active];
      if (c) choose(c);
    } else if (e.key === 'Escape') {
      setTerm('');
    }
  };

  return (
    <div className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {term.trim().length >= 1 && (
        <ul
          ref={listRef}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          {results.map((c, idx) => (
            <li key={c.id}>
              <button
                type="button"
                data-idx={idx}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${
                  idx === active ? 'bg-slate-100 dark:bg-slate-700' : ''
                }`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose({ id: c.id, name: c.name })}
              >
                <span className="font-medium">{c.name}</span>
                {c.companyName ? (
                  <span className="text-slate-500"> · {c.companyName}</span>
                ) : null}
              </button>
            </li>
          ))}
          {!isFetching && data && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sonuç yok.</li>
          )}
          {isFetching && (
            <li className="px-3 py-2 text-sm text-slate-400">Aranıyor…</li>
          )}
        </ul>
      )}
    </div>
  );
}
