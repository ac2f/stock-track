import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchCustomer } from '../../api/customers.api';
import { CustomerPicker } from '../../components/CustomerPicker';
import { fetchEmployees } from '../../api/users.api';
import {
  createBankAccount,
  deleteBankAccount,
  fetchBankAccounts,
} from '../../api/bank-accounts.api';
import {
  convertLegacyDebtClosing,
  createPayment,
  deletePayment,
  fetchCashCollections,
  fetchLegacyDebtClosings,
  fetchPayments,
  queryPayments,
  settleEmployeeCash,
  updatePayment,
  type ConvertLegacyDebtCloseInput,
  type CreatePaymentInput,
  type UpdatePaymentInput,
} from '../../api/payments.api';
import { useAuth } from '../../context/AuthContext';
import type { Employee, BankAccount, Payment, PaymentMethod } from '../../types';

/** Bir ödeme, kaydından sonra en fazla bu kadar gün düzenlenebilir/silinebilir. */
const EDIT_WINDOW_DAYS = 3;

function isEditable(p: Payment): boolean {
  if (!p.createdAt) return false;
  const ageMs = Date.now() - new Date(p.createdAt).getTime();
  return ageMs <= EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

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
  const { hasRole } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState<CreatePaymentInput>(EMPTY);
  const [lastBalance, setLastBalance] = useState<number | null>(null);
  // Geçmiş filtreleri (istemci tarafı).
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histMethod, setHistMethod] = useState<'' | PaymentMethod>('');

  const { data: employees } = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees });
  const { data: banks } = useQuery({ queryKey: ['bank-accounts'], queryFn: fetchBankAccounts });
  const { data: payments } = useQuery({
    queryKey: ['payments', customerId],
    queryFn: () => fetchPayments(customerId),
    enabled: !!customerId,
  });
  // Seçilen müşterinin güncel bakiyesi (tek kayıt sorgusu).
  const { data: selectedCustomer } = useQuery({
    queryKey: ['customers', 'one', customerId],
    queryFn: () => fetchCustomer(customerId),
    enabled: !!customerId,
  });
  // #6 Anlık bakiye: son ödemenin döndürdüğü bakiye varsa onu göster.
  const displayBalance =
    lastBalance ?? (selectedCustomer ? Number(selectedCustomer.currentBalance) : null);

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

      {/* #4/#5 Çalışan kasası — yalnızca İşletme Sahibi */}
      {hasRole('owner') && <CashCollectionsPanel />}

      {/* Uyumluluk: eski "borç kapatma" hareketlerini ödemeye çevirme */}
      {hasRole('owner') && <LegacyDebtClosePanel employees={employees} banks={banks} />}

      {/* #1 Müşteri arama — teklislerdeki gibi klavye destekli seçici. */}
      <div className="card space-y-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">
            Müşteri ara (ad / firma / telefon)
          </span>
          <CustomerPicker
            placeholder="Müşteri arayın… (↑/↓ + Enter ile seçin)"
            onChange={(id) => {
              setCustomerId(id);
              setLastBalance(null);
            }}
          />
        </label>
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

          {/* "Borç kapa": tahsilattan sonra kalan borç indirimle sıfırlanır. */}
          {form.direction === 'incoming' && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={!!form.closeDebt}
                onChange={(e) => setForm({ ...form, closeDebt: e.target.checked })}
              />
              <span>
                <span className="font-medium text-amber-700">Borç kapa</span>
                <span className="block text-xs text-slate-500">
                  Bu tahsilattan sonra kalan borç varsa, kalan fark <b>indirim</b>{' '}
                  olarak yazılıp cari borcu sıfırlanır.
                  {displayBalance != null && form.amount > 0 && displayBalance - form.amount > 0
                    ? ` Tahmini indirim: ${money.format(
                        Math.round((displayBalance - form.amount) * 100) / 100,
                      )}`
                    : ''}
                </span>
              </span>
            </label>
          )}

          <button className="btn-primary" disabled={!canSubmit} onClick={() => createMut.mutate(form)}>
            {form.closeDebt ? 'Tahsil Et ve Borcu Kapat' : 'Ödemeyi Kaydet'}
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
            <PaymentRow
              key={p.id}
              customerId={customerId}
              payment={p}
              employees={employees}
              banks={banks}
              onChanged={(bal) => setLastBalance(bal)}
            />
          ))}
          {!filteredPayments.length && <p className="text-slate-400">Kayıt yok.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * #4/#5 Çalışan kasası: her çalışanın üzerindeki tahsil edilmemiş nakit toplamı.
 * "Tahsil ettim" ile o çalışanın nakdi toplu kapatılır ve bir daha listede çıkmaz.
 */
function CashCollectionsPanel() {
  const qc = useQueryClient();
  const [detailFor, setDetailFor] = useState<string | null>(null);

  const { data: collections } = useQuery({
    queryKey: ['cash-collections'],
    queryFn: fetchCashCollections,
  });
  const { data: detail } = useQuery({
    queryKey: ['payments-detail', detailFor],
    queryFn: () => queryPayments({ receivedById: detailFor!, method: 'cash', settled: false }),
    enabled: !!detailFor,
  });

  const settleMut = useMutation({
    mutationFn: settleEmployeeCash,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-collections'] });
      qc.invalidateQueries({ queryKey: ['payments-detail'] });
      setDetailFor(null);
    },
  });

  if (!collections?.length) {
    return (
      <div className="card text-sm text-slate-500">
        Çalışanlar üzerinde tahsil edilmemiş nakit yok.
      </div>
    );
  }

  return (
    <div className="card space-y-2">
      <h2 className="font-medium">Çalışan kasası — tahsil edilmemiş nakit</h2>
      {collections.map((c) => (
        <div key={c.employeeId} className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
          <div className="flex items-center justify-between gap-2">
            <span>
              {c.employeeName} · {c.count} tahsilat ·{' '}
              <span className="font-semibold text-amber-700">{money.format(c.total)}</span>
            </span>
            <div className="flex gap-2">
              <button
                className="btn bg-slate-100 text-xs"
                onClick={() => setDetailFor(detailFor === c.employeeId ? null : c.employeeId)}
              >
                {detailFor === c.employeeId ? 'Gizle' : 'Detay'}
              </button>
              <button
                className="btn bg-emerald-600 text-white text-xs"
                disabled={settleMut.isPending}
                onClick={() => {
                  if (confirm(`${c.employeeName} çalışanından ${money.format(c.total)} nakit tahsil edildi olarak işaretlensin mi?`)) {
                    settleMut.mutate(c.employeeId);
                  }
                }}
              >
                Tahsil ettim
              </button>
            </div>
          </div>
          {detailFor === c.employeeId && (
            <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              {detail?.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>
                    {p.paymentDate?.slice(0, 10)} · {p.customer?.name ?? 'Müşteri'}
                  </span>
                  <span>{money.format(Number(p.amount))}</span>
                </div>
              ))}
              {!detail?.length && <p className="text-slate-400">—</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Tek ödeme satırı: bilgi + (son 3 gün içindeyse) düzenle/sil.
 * Düzenlemede tutar/yöntem/tarih/not değişebilir; kalan bakiye backend'de
 * yeniden hesaplanır.
 */
function PaymentRow({
  customerId,
  payment: p,
  employees,
  banks,
  onChanged,
}: {
  customerId: string;
  payment: Payment;
  employees?: Employee[];
  banks?: BankAccount[];
  onChanged: (balance: number) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdatePaymentInput>({});
  const editable = isEditable(p);

  const startEdit = () => {
    setForm({
      amount: Number(p.amount),
      method: p.method,
      paymentDate: p.paymentDate?.slice(0, 10),
      receivedById: p.receivedBy?.id,
      bankAccountId: p.bankAccount?.id,
      cardBusinessName: p.cardBusinessName,
      note: p.note,
    });
    setEditing(true);
  };

  const invalidate = (balance: number) => {
    onChanged(balance);
    qc.invalidateQueries({ queryKey: ['payments', customerId] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['customers', 'one', customerId] });
  };

  const updateMut = useMutation({
    mutationFn: () => updatePayment(customerId, p.id, form),
    onSuccess: (res) => {
      invalidate(res.currentBalance);
      setEditing(false);
    },
  });
  const deleteMut = useMutation({
    mutationFn: () => deletePayment(customerId, p.id),
    onSuccess: (res) => invalidate(res.currentBalance),
  });

  const editReady =
    (form.amount ?? 0) > 0 &&
    (form.method !== 'cash' || form.receivedById) &&
    (form.method !== 'bank_transfer' || form.bankAccountId);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">
            {p.direction === 'incoming' ? 'Tahsilat' : 'Ödeme'} · {METHOD_LABELS[p.method]}
            {p.isDebtClose && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-700">
                borç kapama
              </span>
            )}
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
        <div className="flex items-center gap-2">
          <span className="font-semibold">{money.format(Number(p.amount))}</span>
          {editable && !editing && (
            <>
              <button className="btn bg-slate-100 text-xs" onClick={startEdit}>
                Düzenle
              </button>
              <button
                className="btn bg-red-50 text-xs text-red-600"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (confirm('Bu ödeme silinsin mi? Cari bakiyesi yeniden hesaplanır.')) {
                    deleteMut.mutate();
                  }
                }}
              >
                Sil
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Tutar</span>
              <input
                className="input"
                type="number"
                min={0}
                value={form.amount ?? ''}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Tarih</span>
              <input
                className="input"
                type="date"
                value={form.paymentDate ?? ''}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value || undefined })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Yöntem</span>
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
            {form.method === 'cash' && (
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">Parayı alan çalışan</span>
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
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">Banka hesabı</span>
                <select
                  className="input"
                  value={form.bankAccountId ?? ''}
                  onChange={(e) => setForm({ ...form, bankAccountId: e.target.value || undefined })}
                >
                  <option value="">Hesap seçin…</option>
                  {banks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.method === 'card' && (
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">İşletme / POS adı</span>
                <input
                  className="input"
                  value={form.cardBusinessName ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, cardBusinessName: e.target.value || undefined })
                  }
                />
              </label>
            )}
            <label className="col-span-2 block text-xs">
              <span className="mb-1 block text-slate-500">Not</span>
              <input
                className="input"
                value={form.note ?? ''}
                onChange={(e) => setForm({ ...form, note: e.target.value || undefined })}
              />
            </label>
          </div>
          {updateMut.isError && (
            <p className="text-xs text-red-600">
              {(updateMut.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Güncellenemedi.'}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs"
              disabled={!editReady || updateMut.isPending}
              onClick={() => updateMut.mutate()}
            >
              Kaydet
            </button>
            <button className="btn text-xs" onClick={() => setEditing(false)}>
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Uyumluluk paneli: bu güncellemeden önce "borç kapatma" ile girilmiş fakat
 * gerçek ödeme kaydı oluşturmamış hareketleri teker teker listeler. Her biri
 * için ödeme yöntemi seçilip gerçek ödemeye çevrilebilir; varsayılan tarih o
 * borç kapatma tarihidir. Çevirme cari bakiyeyi değiştirmez.
 */
function LegacyDebtClosePanel({
  employees,
  banks,
}: {
  employees?: Employee[];
  banks?: BankAccount[];
}) {
  const { data: legacy } = useQuery({
    queryKey: ['legacy-debt-closings'],
    queryFn: fetchLegacyDebtClosings,
  });

  if (!legacy?.length) return null;

  return (
    <div className="card space-y-2 border border-amber-200 bg-amber-50/40">
      <h2 className="font-medium text-amber-800">
        Eski borç kapatmaları ödemeye çevir ({legacy.length})
      </h2>
      <p className="text-xs text-slate-500">
        Bu kayıtlar önceki sürümde "borç kapatma" ile girildi ama ödeme geçmişinde
        görünmüyor. Her birini uygun ödeme yöntemiyle gerçek ödemeye çevirin;
        bakiye değişmez, varsayılan tarih borç kapatma tarihidir.
      </p>
      {legacy.map((row) => (
        <LegacyDebtCloseRow
          key={row.ledgerEntryId}
          row={row}
          employees={employees}
          banks={banks}
        />
      ))}
    </div>
  );
}

function LegacyDebtCloseRow({
  row,
  employees,
  banks,
}: {
  row: { ledgerEntryId: string; customerName: string; amount: number; occurredAt: string };
  employees?: Employee[];
  banks?: BankAccount[];
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState<ConvertLegacyDebtCloseInput>({
    method: 'cash',
    paymentDate: row.occurredAt?.slice(0, 10),
  });

  const convertMut = useMutation({
    mutationFn: () => convertLegacyDebtClosing(row.ledgerEntryId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['legacy-debt-closings'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });

  const ready =
    input.method === 'cash'
      ? !!input.receivedById
      : input.method === 'bank_transfer'
        ? !!input.bankAccountId
        : true;

  return (
    <div className="space-y-1 rounded-lg bg-white p-2 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{row.customerName}</span> ·{' '}
          {row.occurredAt?.slice(0, 10)}
        </span>
        <span className="font-semibold">{money.format(Number(row.amount))}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={input.method}
          onChange={(e) =>
            setInput({
              ...input,
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
        {input.method === 'cash' && (
          <select
            className="input w-auto"
            value={input.receivedById ?? ''}
            onChange={(e) => setInput({ ...input, receivedById: e.target.value || undefined })}
          >
            <option value="">Çalışan…</option>
            {employees?.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName}
              </option>
            ))}
          </select>
        )}
        {input.method === 'bank_transfer' && (
          <select
            className="input w-auto"
            value={input.bankAccountId ?? ''}
            onChange={(e) => setInput({ ...input, bankAccountId: e.target.value || undefined })}
          >
            <option value="">Banka hesabı…</option>
            {banks?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bankName}
              </option>
            ))}
          </select>
        )}
        {input.method === 'card' && (
          <input
            className="input w-auto flex-1"
            placeholder="İşletme / POS adı"
            value={input.cardBusinessName ?? ''}
            onChange={(e) => setInput({ ...input, cardBusinessName: e.target.value || undefined })}
          />
        )}
        <input
          className="input w-auto"
          type="date"
          value={input.paymentDate ?? ''}
          onChange={(e) => setInput({ ...input, paymentDate: e.target.value || undefined })}
        />
        <button
          className="btn bg-emerald-600 text-xs text-white"
          disabled={!ready || convertMut.isPending}
          onClick={() => convertMut.mutate()}
        >
          Ödemeye çevir
        </button>
      </div>
      {convertMut.isError && (
        <p className="text-xs text-red-600">
          {(convertMut.error as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Çevrilemedi.'}
        </p>
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
