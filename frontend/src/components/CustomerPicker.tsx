import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCustomers } from '../api/customers.api';

/**
 * Arama tabanlı müşteri seçici. Veritabanı büyüdüğünde tüm listeyi getirmek
 * yerine yazdıkça (server-side) arama yapar. Seçim yapılınca id (ve ad) yukarı
 * bildirilir; "değiştir" ile yeni arama açılır.
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
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    initialName ? { id: '', name: initialName } : null,
  );

  const { data, isFetching } = useQuery({
    queryKey: ['customer-search', term],
    queryFn: () =>
      fetchCustomers({ search: term || undefined, page: 1, limit: 20, sort: 'name' }),
    enabled: !picked && term.trim().length >= 1,
  });

  if (picked && picked.id) {
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

  return (
    <div className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        autoComplete="off"
      />
      {term.trim().length >= 1 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {data?.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => {
                  setPicked({ id: c.id, name: c.name });
                  setTerm('');
                  onChange(c.id, c.name);
                }}
              >
                <span className="font-medium">{c.name}</span>
                {c.companyName ? (
                  <span className="text-slate-500"> · {c.companyName}</span>
                ) : null}
              </button>
            </li>
          ))}
          {!isFetching && data && data.items.length === 0 && (
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
