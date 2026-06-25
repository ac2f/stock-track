import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchCustomers, type CustomerFilters } from '../../api/customers.api';

const currency = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

/**
 * Cari listesi + borç durumuna göre filtreleme ve sıralama.
 */
export function CustomersListPage() {
  const [filters, setFilters] = useState<CustomerFilters>({
    page: 1,
    limit: 20,
    sort: 'balance',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['customers', filters],
    queryFn: () => fetchCustomers(filters),
  });

  const set = (patch: Partial<CustomerFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Müşteriler / Cari</h1>

      <div className="card space-y-3">
        <input
          className="input"
          placeholder="Ara (ad, firma, telefon)…"
          onChange={(e) => set({ search: e.target.value || undefined })}
        />
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-[44px] items-center gap-2 px-2 text-sm">
            <input
              type="checkbox"
              onChange={(e) => set({ hasDebt: e.target.checked || undefined })}
            />
            Yalnızca borçlular
          </label>
          <select
            className="input w-auto"
            value={filters.sort}
            onChange={(e) =>
              set({ sort: e.target.value as CustomerFilters['sort'] })
            }
          >
            <option value="balance">Borca göre</option>
            <option value="name">Ada göre</option>
            <option value="recent">Son hareket</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((c) => (
            <div
              key={c.id}
              className="card flex items-center justify-between"
            >
              <div>
                <h3 className="font-medium">{c.name}</h3>
                <p className="text-sm text-slate-500">
                  {c.companyName ?? c.phone ?? '—'}
                </p>
              </div>
              <span
                className={`text-sm font-semibold ${
                  c.currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {currency.format(c.currentBalance)}
              </span>
            </div>
          ))}
          {!data?.items.length && (
            <p className="text-slate-400">Kayıt bulunamadı.</p>
          )}
        </div>
      )}
    </div>
  );
}
