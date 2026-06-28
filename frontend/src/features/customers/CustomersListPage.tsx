import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createCustomer,
  fetchCustomers,
  type CreateCustomerInput,
  type CustomerFilters,
} from '../../api/customers.api';

const currency = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

const EMPTY: CreateCustomerInput = { name: '' };

function NewCustomerForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateCustomerInput>(EMPTY);

  const createMut = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  return (
    <div className="card space-y-3">
      {createMut.error && (
        <p className="text-sm text-red-600">
          {(createMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Müşteri oluşturulamadı.'}
        </p>
      )}
      <input
        className="input"
        placeholder="Ad Soyad"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        className="input"
        placeholder="Firma Adı"
        value={form.companyName ?? ''}
        onChange={(e) => setForm({ ...form, companyName: e.target.value || undefined })}
      />
      <input
        className="input"
        placeholder="Telefon"
        value={form.phone ?? ''}
        onChange={(e) => setForm({ ...form, phone: e.target.value || undefined })}
      />
      <input
        className="input"
        placeholder="E-posta"
        value={form.email ?? ''}
        onChange={(e) => setForm({ ...form, email: e.target.value || undefined })}
      />
      <input
        className="input"
        placeholder="Adres"
        value={form.address ?? ''}
        onChange={(e) => setForm({ ...form, address: e.target.value || undefined })}
      />
      <input
        className="input"
        placeholder="Vergi No"
        value={form.taxNumber ?? ''}
        onChange={(e) => setForm({ ...form, taxNumber: e.target.value || undefined })}
      />
      <input
        className="input"
        type="number"
        placeholder="Açılış Bakiyesi"
        value={form.openingBalance ?? ''}
        onChange={(e) =>
          setForm({
            ...form,
            openingBalance: e.target.value ? Number(e.target.value) : undefined,
          })
        }
      />
      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={!form.name}
          onClick={() => createMut.mutate(form)}
        >
          Kaydet
        </button>
        <button className="btn" onClick={onClose}>
          İptal
        </button>
      </div>
    </div>
  );
}

/**
 * Cari listesi + borç durumuna göre filtreleme ve sıralama.
 */
export function CustomersListPage() {
  const [filters, setFilters] = useState<CustomerFilters>({
    page: 1,
    limit: 20,
    sort: 'balance',
  });
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', filters],
    queryFn: () => fetchCustomers(filters),
  });

  const set = (patch: Partial<CustomerFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Müşteriler / Cari</h1>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Yeni Müşteri
          </button>
        )}
      </div>

      {showForm && <NewCustomerForm onClose={() => setShowForm(false)} />}

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
