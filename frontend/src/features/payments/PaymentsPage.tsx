import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchCustomers } from '../../api/customers.api';
import { fetchEmployees } from '../../api/users.api';
import {
  createBankAccount,
  deleteBankAccount,
  fetchBankAccounts,
} from '../../api/bank-accounts.api';
import {
  createPayment,
  fetchPayments,
  type CreatePaymentInput,
} from '../../api/payments.api';
import type { PaymentMethod } from '../../types';

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Nakit',
  bank_transfer: 'Havale/EFT',
  card: 'Kart',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY: CreatePaymentInput = {
  amount: 0,
  method: 'cash',
  direction: 'incoming',
  paymentDate: todayISO(),
};

/** Müşteri ödemeleri (tahsilat/ödeme) girişi ve sorgulanabilir geçmişi. */
export function PaymentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState<CreatePaymentInput>(EMPTY);
  const [lastBalance, setLastBalance] = useState<number | null>(null);
  // Geçmiş filtreleri (istemci tarafı).
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histMethod, setHistMethod] = useState<'' | PaymentMethod>('');

  // #1 Müşteri arama — hepsini listelemek yerine ada/telefona göre sorgula.
  const { data: results } = useQuery({
    queryKey: ['customers', 'search', search],
    queryFn: () => fetchCustomers({ search: search || undefined, page: 1, limit: 20, sort: 'name' }),
    enabled: search.length >= 1,
  });
  const { data: employees } = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees });
  const { data: banks } = useQuery({ queryKey: ['bank-accounts'], queryFn: fetchBankAccounts });
  const { data: payments } = useQuery({
    queryKey: ['payments', customerId],
    queryFn: () => fetchPayments(customerId),
    enabled: !!customerId,
  });

  const selectedCustomer = results?.items.find((c) => c.id === customerId);
  // #6 Anlık bakiye: son ödemenin döndürdüğü bakiye varsa onu göster.
  const displayBalance = lastBalance ?? selectedCustomer?.currentBalance ?? null;

  const createMut = useMutation({
    mutationFn: (input: CreatePaymentInput) => createPayment(customerId, input),
    onSuccess: (res) => {
      setLastBalance(res.currentBalance);
      qc.invalidateQueries({ queryKey: ['payments', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setForm({ ...EMPTY, paymentDate: todayISO() });
    },
  });

  const filteredPayments = useMemo(() => {
    return (payments ?? []).filter((p) => {
      const d = p.paymentDate?.slice(0, 10) ?? '';
      if (histFrom && d < histFrom) return false;
      if (histTo && d > histTo) return false;
      if (histMethod && p.method !== histMethod) return false;
      return true;
    });
  }, [payments, histFrom, histTo, histMethod]);

  const canSubmit =
    customerId &&
    form.amount > 0 &&
    (form.method !== 'cash' || form.receivedById) &&
    (form.method !== 'bank_transfer' || form.bankAccountId) &&
    !createMut.isPending;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Ödemeler / Tahsilat</h1>

      {/* #1 Müşteri arama */}
      <div className="card space-y-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Müşteri ara (ad / firma / telefon)</span>
          <input
            className="input"
            placeholder="En az 1 karakter yazın…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {search && (
          <select
            className="input"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setLastBalance(null);
            }}
          >
            <option value="">Sonuçlardan seçin…</option>
            {results?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ''}
              </option>
            ))}
          </select>
        )}
        {customerId && displayBalance != null && (
          <p className="text-sm">
            Güncel bakiye:{' '}
            <span
              className={
                displayBalance > 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-600'
              }
            >
              {money.format(displayBalance)}
            </span>
          </p>
        )}
      </div>

      {customerId && (
        <div className="card space-y-3">
          <h2 className="font-medium">Yeni ödeme</h2>
          {createMut.error && (
            <p className="text-sm text-red-600">
              {(createMut.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Ödeme kaydedilemedi.'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              {/* #2 Daha anlaşılır yön etiketleri */}
              <span className="mb-1 block text-xs text-slate-500">İşlem yönü</span>
              <select
                className="input"
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value as 'incoming' | 'outgoing' })
                }
              >
                <option value="incoming">Para girişi — müşteriden tahsilat (borç azalır)</option>
                <option value="outgoing">Para çıkışı — müşteriye/sahibe ödeme (alacak azalır)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Tutar</span>
              <input
                className="input"
                type="number"
                min={0}
                value={form.amount || ''}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Yöntem</span>
              <select
                className="input"
                value={form.method}
                onChange={(e) =>
                  setForm({
                    ...form,
                    method: e.target.value as PaymentMethod,
                    receivedById: undefined,
                    bankAccountId: undefined,
                    cardBusinessName: undefined,
                  })
                }
              >
                <option value="cash">Nakit</option>
                <option value="bank_transfer">Havale/EFT</option>
                <option value="card">Kart</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Tarih</span>
              <input
                className="input"
                type="date"
                value={form.paymentDate ?? ''}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value || undefined })}
              />
            </label>
          </div>

          {form.method === 'cash' && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Parayı teslim alan çalışan</span>
              <select
                className="input"
                value={form.receivedById ?? ''}
                onChange={(e) => setForm({ ...form, receivedById: e.target.value || undefined })}
              >
                <option value="">Çalışan seçin…</option>
                {employees?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {form.method === 'bank_transfer' && (
            <div className="space-y-1">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-slate-500">Banka hesabı</span>
                <select
                  className="input"
                  value={form.bankAccountId ?? ''}
                  onChange={(e) => setForm({ ...form, bankAccountId: e.target.value || undefined })}
                >
                  <option value="">Hesap seçin…</option>
                  {banks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName}
                      {b.iban ? ` · ${b.iban}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <BankAccountManager />
            </div>
          )}
          {form.method === 'card' && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">
                İşletme / POS adı (kartın geçtiği yer)
              </span>
              <input
                className="input"
                value={form.cardBusinessName ?? ''}
                onChange={(e) => setForm({ ...form, cardBusinessName: e.target.value || undefined })}
                placeholder="örn. Bizim işletme / X Market POS"
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Referans / Not</span>
            <input
              className="input"
              value={form.note ?? ''}
              onChange={(e) => setForm({ ...form, note: e.target.value || undefined })}
            />
          </label>

          <button className="btn-primary" disabled={!canSubmit} onClick={() => createMut.mutate(form)}>
            Ödemeyi Kaydet
          </button>
        </div>
      )}

      {customerId && (
        <div className="space-y-2">
          <h2 className="font-medium">Ödeme geçmişi</h2>
          {/* #6 Geçmiş filtreleri */}
          <div className="card grid grid-cols-3 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Başlangıç</span>
              <input className="input" type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Bitiş</span>
              <input className="input" type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Yöntem</span>
              <select
                className="input"
                value={histMethod}
                onChange={(e) => setHistMethod(e.target.value as '' | PaymentMethod)}
              >
                <option value="">Tümü</option>
                <option value="cash">Nakit</option>
                <option value="bank_transfer">Havale/EFT</option>
                <option value="card">Kart</option>
              </select>
            </label>
          </div>
          {filteredPayments.map((p) => (
            <div key={p.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {p.direction === 'incoming' ? 'Tahsilat' : 'Ödeme'} · {METHOD_LABELS[p.method]}
                </p>
                <p className="text-sm text-slate-500">
                  {p.paymentDate?.slice(0, 10)}
                  {p.method === 'cash' && p.receivedBy ? ` · ${p.receivedBy.fullName}` : ''}
                  {p.method === 'bank_transfer' && p.bankAccount ? ` · ${p.bankAccount.bankName}` : ''}
                  {p.method === 'card' && p.cardBusinessName ? ` · ${p.cardBusinessName}` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </p>
                {/* #6 Her ödemeden sonra kalan bakiye */}
                <p className="text-xs text-slate-400">
                  Kalan bakiye: {money.format(Number(p.balanceAfter))}
                </p>
              </div>
              <span className="font-semibold">{money.format(Number(p.amount))}</span>
            </div>
          ))}
          {!filteredPayments.length && <p className="text-slate-400">Kayıt yok.</p>}
        </div>
      )}
    </div>
  );
}

/** #3 Havale için banka hesabı ekle/sil (satır içi). */
function BankAccountManager() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');
  const { data: banks } = useQuery({ queryKey: ['bank-accounts'], queryFn: fetchBankAccounts });
  const inv = () => qc.invalidateQueries({ queryKey: ['bank-accounts'] });

  const addMut = useMutation({
    mutationFn: createBankAccount,
    onSuccess: () => {
      inv();
      setBankName('');
      setIban('');
    },
  });
  const delMut = useMutation({ mutationFn: deleteBankAccount, onSuccess: inv });

  return (
    <div className="rounded-lg bg-slate-50 p-2 text-sm">
      <button className="text-xs text-slate-500 underline" onClick={() => setOpen((o) => !o)}>
        {open ? 'Banka hesabı yönetimini gizle' : 'Banka hesabı ekle / kaldır'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {addMut.error && (
            <p className="text-xs text-red-600">
              {(addMut.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Eklenemedi (IBAN en az 10 karakter, ad-soyad gerekli).'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              className="input flex-1"
              placeholder="Banka adı"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
            <input
              className="input flex-1"
              placeholder="IBAN"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
            <button
              className="btn"
              disabled={bankName.trim().length < 2 || iban.trim().length < 10}
              onClick={() =>
                addMut.mutate({ bankName: bankName.trim(), accountName: bankName.trim(), iban: iban.trim() })
              }
            >
              Ekle
            </button>
          </div>
          {banks?.map((b) => (
            <div key={b.id} className="flex items-center justify-between">
              <span>
                {b.bankName} · {b.iban}
              </span>
              <button
                className="text-red-600"
                onClick={() => {
                  if (confirm(`${b.bankName} hesabı silinsin mi?`)) delMut.mutate(b.id);
                }}
              >
                Sil
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
