import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchCustomers } from '../../api/customers.api';
import { fetchEmployees } from '../../api/users.api';
import { fetchBankAccounts } from '../../api/bank-accounts.api';
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

/** Müşteri ödemeleri (tahsilat/ödeme) girişi ve geçmişi. */
export function PaymentsPage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState<CreatePaymentInput>(EMPTY);

  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => fetchCustomers({ page: 1, limit: 200, sort: 'name' }),
  });
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
  });
  const { data: banks } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: fetchBankAccounts,
  });
  const { data: payments } = useQuery({
    queryKey: ['payments', customerId],
    queryFn: () => fetchPayments(customerId),
    enabled: !!customerId,
  });

  const createMut = useMutation({
    mutationFn: (input: CreatePaymentInput) => createPayment(customerId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setForm({ ...EMPTY, paymentDate: todayISO() });
    },
  });

  const canSubmit =
    customerId &&
    form.amount > 0 &&
    (form.method !== 'cash' || form.receivedById) &&
    (form.method !== 'bank_transfer' || form.bankAccountId) &&
    !createMut.isPending;

  const selectedCustomer = customers?.items.find((c) => c.id === customerId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Ödemeler / Tahsilat</h1>

      <div className="card space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Müşteri</span>
          <select
            className="input"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Müşteri seçin…</option>
            {customers?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {selectedCustomer && (
          <p className="text-sm">
            Güncel bakiye:{' '}
            <span
              className={
                selectedCustomer.currentBalance > 0
                  ? 'font-semibold text-red-600'
                  : 'font-semibold text-emerald-600'
              }
            >
              {money.format(selectedCustomer.currentBalance)}
            </span>
          </p>
        )}
      </div>

      {customerId && (
        <div className="card space-y-3">
          <h2 className="font-medium">Yeni ödeme</h2>
          {createMut.error && (
            <p className="text-sm text-red-600">
              {(createMut.error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message ?? 'Ödeme kaydedilemedi.'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Yön</span>
              <select
                className="input"
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value as 'incoming' | 'outgoing' })
                }
              >
                <option value="incoming">Tahsilat (müşteriden)</option>
                <option value="outgoing">Ödeme (sahibe)</option>
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
          )}
          {form.method === 'card' && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">
                İşletme / POS adı (kartın geçtiği yer)
              </span>
              <input
                className="input"
                value={form.cardBusinessName ?? ''}
                onChange={(e) =>
                  setForm({ ...form, cardBusinessName: e.target.value || undefined })
                }
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
          {payments?.map((p) => (
            <div key={p.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {p.direction === 'incoming' ? 'Tahsilat' : 'Ödeme'} ·{' '}
                  {METHOD_LABELS[p.method]}
                </p>
                <p className="text-sm text-slate-500">
                  {p.paymentDate?.slice(0, 10)}
                  {p.method === 'cash' && p.receivedBy ? ` · ${p.receivedBy.fullName}` : ''}
                  {p.method === 'bank_transfer' && p.bankAccount
                    ? ` · ${p.bankAccount.bankName}`
                    : ''}
                  {p.method === 'card' && p.cardBusinessName ? ` · ${p.cardBusinessName}` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </p>
              </div>
              <span className="font-semibold">{money.format(Number(p.amount))}</span>
            </div>
          ))}
          {!payments?.length && <p className="text-slate-400">Henüz ödeme yok.</p>}
        </div>
      )}
    </div>
  );
}
