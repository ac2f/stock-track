import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  addCustomerLedgerEntry,
  createCustomer,
  fetchCustomerLedger,
  fetchCustomers,
  type CreateCustomerInput,
  type CustomerFilters,
} from '../../api/customers.api';
import { downloadFile, openPdf } from '../../api/documents.api';
import type { Customer } from '../../types';

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
  const goPage = (page: number) => setFilters((f) => ({ ...f, page }));
  const meta = data?.meta;

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
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Kayıt başlangıç</span>
            <input
              className="input"
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => set({ from: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Kayıt bitiş</span>
            <input
              className="input"
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => set({ to: e.target.value || undefined })}
            />
          </label>
        </div>
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
            <CustomerRow key={c.id} customer={c} />
          ))}
          {!data?.items.length && (
            <p className="text-slate-400">Kayıt bulunamadı.</p>
          )}

          {meta && meta.pageCount > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <button
                className="btn bg-slate-100"
                disabled={meta.page <= 1}
                onClick={() => goPage(meta.page - 1)}
              >
                ← Önceki
              </button>
              <span className="text-slate-500">
                Sayfa {meta.page} / {meta.pageCount} · {meta.total} kayıt
              </span>
              <button
                className="btn bg-slate-100"
                disabled={meta.page >= meta.pageCount}
                onClick={() => goPage(meta.page + 1)}
              >
                Sonraki →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Tek cari satırı: bakiye + ekstre (geçmiş tarihli borç/ödeme) açılır. */
function CustomerRow({ customer }: { customer: Customer }) {
  const [openStatement, setOpenStatement] = useState(false);
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{customer.name}</h3>
          <p className="text-sm text-slate-500">
            {customer.companyName ?? customer.phone ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-semibold ${
              customer.currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {currency.format(customer.currentBalance)}
          </span>
          <button className="btn bg-slate-100 text-xs" onClick={() => setOpenStatement((o) => !o)}>
            {openStatement ? 'Kapat' : 'Ekstre'}
          </button>
        </div>
      </div>
      {openStatement && (
        <CustomerStatement customerId={customer.id} customerName={customer.name} />
      )}
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  opening: 'Açılış',
  processing: 'İşleme',
  sale: 'Satış',
  payment: 'Ödeme',
  manual_adjustment: 'Manuel',
};

/**
 * #8b Cari ekstre: hareketler tarihe göre kronolojik; yürüyen bakiye yeniden
 * hesaplanır. Geçmiş tarihli borç/ödeme eklenebilir (description ödeme yerini taşır).
 */
function CustomerStatement({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [entryType, setEntryType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState('');

  const { data: ledger } = useQuery({
    queryKey: ['ledger', customerId],
    queryFn: () => fetchCustomerLedger(customerId),
  });
  const addMut = useMutation({
    mutationFn: () =>
      addCustomerLedgerEntry(customerId, {
        entryType,
        amount: Number(amount),
        occurredAt: date,
        description: desc || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ledger', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setAmount('');
      setDesc('');
    },
  });

  // Kronolojik sırala + yürüyen bakiyeyi yeniden hesapla.
  const rows = [...(ledger ?? [])].sort((a, b) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0,
  );
  let running = 0;
  const computed = rows.map((e) => {
    running += e.entryType === 'debit' ? Number(e.amount) : -Number(e.amount);
    return { ...e, running };
  });

  const fileSlug =
    customerName
      .toLocaleLowerCase('tr')
      .replace(/[^a-z0-9çğıöşü]+/gi, '-')
      .replace(/^-+|-+$/g, '') || customerId.slice(0, 8);

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-2">
      <div className="flex justify-end gap-2">
        <button
          className="btn bg-slate-100 text-xs"
          onClick={() =>
            downloadFile(`/customers/${customerId}/statement.csv`, `ekstre-${fileSlug}.csv`)
          }
        >
          CSV
        </button>
        <button
          className="btn bg-slate-100 text-xs"
          onClick={() => openPdf(`/customers/${customerId}/statement.pdf`)}
        >
          PDF
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Tarih</th>
              <th className="py-1">Açıklama</th>
              <th className="py-1 text-right">Borç</th>
              <th className="py-1 text-right">Ödeme/Alacak</th>
              <th className="py-1 text-right">Bakiye</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="py-1">{e.occurredAt?.slice(0, 10)}</td>
                <td className="py-1">
                  {SOURCE_LABELS[e.sourceType] ?? e.sourceType}
                  {e.description ? ` · ${e.description}` : ''}
                </td>
                <td className="py-1 text-right text-red-600">
                  {e.entryType === 'debit' ? currency.format(Number(e.amount)) : ''}
                </td>
                <td className="py-1 text-right text-emerald-700">
                  {e.entryType === 'credit' ? currency.format(Number(e.amount)) : ''}
                </td>
                <td className="py-1 text-right font-medium">{currency.format(e.running)}</td>
              </tr>
            ))}
            {!computed.length && (
              <tr>
                <td colSpan={5} className="py-2 text-center text-slate-400">
                  Hareket yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Geçmiş tarihli borç/ödeme ekle */}
      <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2">
        <select
          className="input w-auto"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as 'debit' | 'credit')}
        >
          <option value="debit">Borç ekle</option>
          <option value="credit">Ödeme/alacak ekle</option>
        </select>
        <input
          className="input w-28"
          type="number"
          min={0}
          placeholder="Tutar"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="input w-auto"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          className="input flex-1"
          placeholder="Açıklama (örn. nakit / havale ABC Banka)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={!amount || Number(amount) <= 0 || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          Ekle
        </button>
      </div>
    </div>
  );
}
