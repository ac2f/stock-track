import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomer } from '../../api/customers.api';
import { CustomerPicker } from '../../components/CustomerPicker';
import { Can } from '../../components/Can';
import { confirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { Filters } from '../../components/ui/Filters';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { useUrlParam } from '../../hooks/useUrlParam';
import { formatDate, formatMoney } from '../../lib/format';
import { toast } from '../../lib/toast';
import { type StaffMember } from '../../api/shops.api';
import { createBankAccount, deleteBankAccount } from '../../api/bank-accounts.api';
import { useBankAccounts, useStaff } from '../../hooks/useReferenceData';
import { usePageSize } from '../../hooks/usePageSize';
import { Pagination } from '../../components/Pagination';
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
import type { BankAccount, Payment, PaymentMethod } from '../../types';

/**
 * Bir ödeme, kaydından sonra en fazla bu kadar gün düzenlenebilir/silinebilir.
 * İşletme Sahibi bu pencereyle sınırlı değildir — yanlışlıkla girilmiş bir
 * tahsilat sonradan fark edilse de geri alınabilsin (backend de aynı kuralda).
 */
const EDIT_WINDOW_DAYS = 3;

function isEditable(p: Payment, isOwner: boolean): boolean {
  if (isOwner) return true;
  if (!p.createdAt) return false;
  const ageMs = Date.now() - new Date(p.createdAt).getTime();
  return ageMs <= EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Nakit',
  bank_transfer: 'Havale/EFT',
  card: 'Kart',
};

const METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: '💵',
  bank_transfer: '🏦',
  card: '💳',
};

const METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'card'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Bakiye rengi: borç kırmızı, alacak yeşil, sıfır soluk. */
function balanceTone(balance: number): string {
  if (balance > 0) return 'text-red-600';
  if (balance < 0) return 'text-emerald-600';
  return 'text-slate-400';
}

const EMPTY: CreatePaymentInput = {
  amount: 0,
  method: 'cash',
  direction: 'incoming',
  paymentDate: todayISO(),
};

/**
 * Ödeme yöntemi seçimi: büyük, dokunmaya uygun bölmeli düğmeler
 * (değerler eski <select> ile aynı: cash / bank_transfer / card).
 */
function MethodSegment({
  value,
  onChange,
  compact = false,
}: {
  value?: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Ödeme yöntemi">
      {METHODS.map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m)}
            className={`btn border px-2 ${
              compact ? 'btn-sm' : 'min-h-[56px] flex-col gap-0.5 sm:flex-row sm:gap-1.5'
            } ${
              active
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {!compact && (
              <span className="text-lg leading-none" aria-hidden>
                {METHOD_ICONS[m]}
              </span>
            )}
            <span>{METHOD_LABELS[m]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Adım başlığı: numaralı daire (tamamlanınca ✓) + başlık. */
function StepTitle({
  n,
  title,
  hint,
  done,
}: {
  n: number;
  title: string;
  hint?: ReactNode;
  done?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
          done ? 'bg-emerald-600' : 'bg-blue-600'
        }`}
        aria-hidden
      >
        {done ? '✓' : n}
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold leading-7">
          <span className="sr-only">Adım {n}: </span>
          {title}
        </h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

/** Müşteri ödemeleri (tahsilat/ödeme) girişi ve sorgulanabilir geçmişi. */
export function PaymentsPage() {
  const qc = useQueryClient();
  const { can, isShopAdmin } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState<CreatePaymentInput>(EMPTY);
  const [lastBalance, setLastBalance] = useState<number | null>(null);
  // Bağlantıyla seçilen müşteri seçicide adıyla görünsün diye seçici yeniden
  // kurulur (key) ve adı initialName olarak verilir.
  const [picker, setPicker] = useState<{ key: number; name?: string }>({ key: 0 });
  // Geçmiş filtreleri ve sayfalama — sunucuda uygulanır (müşterinin bütün
  // ödemeleri indirilip tarayıcıda süzülmez).
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histMethod, setHistMethod] = useState<'' | PaymentMethod>('');
  const [histPageSize, setHistPageSize] = usePageSize('payments-history', 20);
  // Müşteri/süzgeç/sayfa boyu değişince 1. sayfaya dönülür (aynı çizimde —
  // eski sayfa numarasıyla gereksiz bir istek gitmez).
  const histSig = JSON.stringify([customerId, histFrom, histTo, histMethod, histPageSize]);
  const [pageState, setPageState] = useState({ sig: histSig, page: 1 });
  const histPage = pageState.sig === histSig ? pageState.page : 1;
  const setHistPage = (page: number) => setPageState({ sig: histSig, page });

  // Çalışan ve banka hesabı listeleri yalnız müşteri seçilince (form ve
  // geçmiş satırları açılınca) gerekir.
  const { data: employees } = useStaff({ enabled: !!customerId });
  const { data: banks } = useBankAccounts({ enabled: !!customerId });
  const histFilters = {
    from: histFrom || undefined,
    to: histTo || undefined,
    method: histMethod || undefined,
    page: histPage,
    limit: histPageSize,
  };
  const { data: paymentsPage, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', customerId, histFilters],
    queryFn: () => fetchPayments(customerId, histFilters),
    enabled: !!customerId,
    // Aynı müşteride süzgeç/sayfa değişirken önceki liste kalır; başka müşteriye
    // geçince eski müşterinin ödemeleri gösterilmez.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === customerId ? prev : undefined,
  });
  const filteredPayments = paymentsPage?.items ?? [];
  // Seçilen müşterinin güncel bakiyesi (tek kayıt sorgusu).
  const { data: selectedCustomer } = useQuery({
    queryKey: ['customers', 'one', customerId],
    queryFn: () => fetchCustomer(customerId),
    enabled: !!customerId,
  });
  // #6 Anlık bakiye: son ödemenin döndürdüğü bakiye varsa onu göster.
  const displayBalance =
    lastBalance ?? (selectedCustomer ? Number(selectedCustomer.currentBalance) : null);

  // Seçicide müşteri seçildiğinde (ya da seçim kaldırıldığında) izlenen yol.
  const pickCustomer = (id: string) => {
    setCustomerId(id);
    setLastBalance(null);
  };

  // Hızlı aramadan (Ctrl+K › Tahsilat) gelen ?customer=<id>: müşteriyi çekip
  // aramada seçilmiş gibi aynı duruma getir.
  useUrlParam('customer', (id) => {
    qc.fetchQuery({ queryKey: ['customers', 'one', id], queryFn: () => fetchCustomer(id) })
      .then((c) => {
        pickCustomer(c.id);
        setPicker((p) => ({ key: p.key + 1, name: c.name }));
      })
      .catch(() => toast.error('Müşteri bulunamadı', 'Lütfen aramadan seçin.'));
  });

  const createMut = useMutation({
    mutationFn: (input: CreatePaymentInput) => createPayment(customerId, input),
    onSuccess: (res) => {
      setLastBalance(res.currentBalance);
      qc.invalidateQueries({ queryKey: ['payments', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      // Aynı sayfadaki çalışan kasası ve müşterinin ekstresi de bu tahsilatı içerir.
      qc.invalidateQueries({ queryKey: ['cash-collections'] });
      qc.invalidateQueries({ queryKey: ['payments-detail'] });
      qc.invalidateQueries({ queryKey: ['ledger', customerId] });
      setForm({ ...EMPTY, paymentDate: todayISO() });
    },
  });

  const canSubmit =
    customerId &&
    form.amount > 0 &&
    (form.method !== 'cash' || form.receivedById) &&
    (form.method !== 'bank_transfer' || form.bankAccountId) &&
    !createMut.isPending;

  // Kaydet düğmesinin neden pasif olduğunu söyle (canSubmit ile aynı koşullar).
  const missing = !(form.amount > 0)
    ? 'Tutarı girin.'
    : form.method === 'cash' && !form.receivedById
      ? 'Parayı teslim alan çalışanı seçin.'
      : form.method === 'bank_transfer' && !form.bankAccountId
        ? 'Banka hesabını seçin.'
        : null;

  const histActive = (histFrom || histTo ? 1 : 0) + (histMethod ? 1 : 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ödemeler / Tahsilat"
        icon="💰"
        subtitle="1) Müşteriyi seçin, 2) tutarı, yöntemi ve parayı alan çalışanı girip kaydedin."
      />

      {/* #4/#5 Çalışan kasası — dükkân yöneticisi (ödeme yazma izniyle) */}
      {isShopAdmin && can('payments', 'write') && <CashCollectionsPanel />}

      {/* Uyumluluk: eski "borç kapatma" hareketlerini ödemeye çevirme */}
      {isShopAdmin && can('payments', 'write') && <LegacyDebtClosePanel />}

      {/* Adım 1 — #1 Müşteri arama: teklislerdeki gibi klavye destekli seçici. */}
      <section className="card space-y-3">
        <StepTitle
          n={1}
          title="Müşteri seçin"
          hint="Ad, firma ya da telefonla arayın; ↑/↓ ile gezip Enter ile seçin."
          done={!!customerId}
        />
        {/* <label> değil <div>: seçiliyken ada tıklamak "değiştir"i tetiklemesin. */}
        <div>
          <span className="label">Müşteri ara (ad / firma / telefon)</span>
          <CustomerPicker
            key={picker.key}
            initialName={picker.name}
            placeholder="Müşteri arayın… (↑/↓ + Enter ile seçin)"
            onChange={(id) => pickCustomer(id)}
          />
        </div>
        {customerId && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">
                Güncel bakiye
                {lastBalance != null && (
                  <span className="badge ml-2 bg-emerald-100 text-emerald-800">✓ son kayıttan sonra</span>
                )}
              </div>
              {displayBalance != null ? (
                <div className={`text-2xl font-bold leading-tight ${balanceTone(displayBalance)}`}>
                  {formatMoney(displayBalance)}
                </div>
              ) : (
                <div className="skeleton mt-1 h-7 w-32" />
              )}
              {displayBalance != null && (
                <div className="text-xs text-slate-500">
                  {displayBalance > 0
                    ? 'Müşterinin borcu'
                    : displayBalance < 0
                      ? 'Müşterinin alacağı'
                      : 'Borcu yok'}
                </div>
              )}
            </div>
            {selectedCustomer && (
              <Can module="customers">
                <Link
                  className="btn-secondary btn-sm"
                  to={`/customers?q=${encodeURIComponent(selectedCustomer.name)}&open=${customerId}`}
                  title="Müşterinin cari ekstresini aç"
                >
                  📄 Ekstre
                </Link>
              </Can>
            )}
          </div>
        )}
      </section>

      {/* Adım 2 — tutar, yöntem ve çalışan */}
      {customerId ? (
        <section className="card space-y-4">
          <StepTitle n={2} title="Tutar, yöntem ve çalışan" />
          {createMut.error && (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
              {(createMut.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Ödeme kaydedilemedi.'}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              {/* #2 Daha anlaşılır yön etiketleri */}
              <span className="label">İşlem yönü</span>
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
            <div className="min-w-0">
              <label className="block">
                <span className="label">
                  Tutar <span className="text-red-600">*</span>
                </span>
                <input
                  className="input text-lg font-semibold md:text-base"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="0,00"
                  autoFocus
                  value={form.amount || ''}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                />
              </label>
              {/* Tek dokunuşla borcun tamamını yaz. */}
              {form.direction === 'incoming' && displayBalance != null && displayBalance > 0 && (
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-blue-600 hover:underline"
                  onClick={() => setForm({ ...form, amount: displayBalance })}
                >
                  Borcun tamamı: {formatMoney(displayBalance)}
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="label">Ödeme yöntemi</span>
            <MethodSegment
              value={form.method}
              onChange={(m) =>
                setForm({
                  ...form,
                  method: m,
                  receivedById: undefined,
                  bankAccountId: undefined,
                  cardBusinessName: undefined,
                })
              }
            />
          </div>

          {form.method === 'cash' && (
            <label className="block">
              <span className="label">
                Parayı teslim alan çalışan <span className="text-red-600">*</span>
              </span>
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
            <div className="space-y-2">
              <label className="block">
                <span className="label">
                  Banka hesabı <span className="text-red-600">*</span>
                </span>
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
            <label className="block">
              <span className="label">İşletme / POS adı (kartın geçtiği yer)</span>
              <input
                className="input"
                value={form.cardBusinessName ?? ''}
                onChange={(e) => setForm({ ...form, cardBusinessName: e.target.value || undefined })}
                placeholder="örn. Bizim işletme / X Market POS"
              />
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="label">Tarih</span>
              <input
                className="input"
                type="date"
                value={form.paymentDate ?? ''}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value || undefined })}
              />
            </label>
            <label className="block min-w-0">
              <span className="label">Referans / Not</span>
              <input
                className="input"
                value={form.note ?? ''}
                onChange={(e) => setForm({ ...form, note: e.target.value || undefined })}
              />
            </label>
          </div>

          {/* "Borç kapa": tahsilattan sonra kalan borç indirimle sıfırlanır. */}
          {form.direction === 'incoming' && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!form.closeDebt}
                onChange={(e) => setForm({ ...form, closeDebt: e.target.checked })}
              />
              <span>
                <span className="font-medium text-amber-700 dark:text-amber-300">Borç kapa</span>
                <span className="block text-xs text-slate-500">
                  Bu tahsilattan sonra kalan borç varsa, kalan fark <b>indirim</b>{' '}
                  olarak yazılıp cari borcu sıfırlanır.
                  {displayBalance != null && form.amount > 0 && displayBalance - form.amount > 0
                    ? ` Tahmini indirim: ${formatMoney(
                        Math.round((displayBalance - form.amount) * 100) / 100,
                      )}`
                    : ''}
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500" aria-live="polite">
              {missing ? (
                <span className="text-amber-700">{missing}</span>
              ) : (
                <>
                  <b className="text-slate-800">{formatMoney(form.amount)}</b>{' '}
                  {form.direction === 'incoming' ? 'tahsil edilecek' : 'ödenecek'} ·{' '}
                  {METHOD_LABELS[form.method]}
                </>
              )}
            </p>
            <button
              className="btn-primary w-full sm:w-auto sm:px-6"
              disabled={!canSubmit}
              onClick={() => createMut.mutate(form)}
            >
              {form.closeDebt ? 'Tahsil Et ve Borcu Kapat' : 'Ödemeyi Kaydet'}
            </button>
          </div>
        </section>
      ) : (
        <section className="card opacity-70">
          <StepTitle
            n={2}
            title="Tutar, yöntem ve çalışan"
            hint="Önce yukarıdan müşteri seçin."
          />
        </section>
      )}

      {customerId && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            Ödeme geçmişi
            {paymentsPage && (
              <span className="badge bg-slate-100 text-slate-600">{paymentsPage.meta?.total ?? filteredPayments.length}</span>
            )}
          </h2>
          {/* #6 Geçmiş filtreleri */}
          <Filters
            activeCount={histActive}
            onClear={() => {
              setHistFrom('');
              setHistTo('');
              setHistMethod('');
            }}
          >
            <DateRangeFilter
              value={{ from: histFrom || undefined, to: histTo || undefined }}
              onChange={(r) => {
                setHistFrom(r.from ?? '');
                setHistTo(r.to ?? '');
              }}
            />
            <label className="block sm:max-w-xs">
              <span className="label">Yöntem</span>
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
          </Filters>
          {paymentsLoading ? (
            <LoadingBlock rows={2} />
          ) : (
            <>
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
              {!filteredPayments.length && (
                <EmptyState
                  compact
                  icon="🧾"
                  title="Kayıt yok."
                  hint={
                    histActive
                      ? 'Seçilen filtrelere uyan ödeme yok; filtreleri temizleyin.'
                      : 'Bu müşteri için henüz ödeme girilmemiş. İlk tahsilatı yukarıdan kaydedin.'
                  }
                />
              )}
              {paymentsPage?.meta && paymentsPage.meta.total > 0 && (
                <Pagination
                  page={paymentsPage.meta.page}
                  pageCount={paymentsPage.meta.pageCount}
                  total={paymentsPage.meta.total}
                  pageSize={histPageSize}
                  onPage={setHistPage}
                  onPageSize={setHistPageSize}
                />
              )}
            </>
          )}
        </section>
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
      <div className="card flex items-center gap-2 py-3 text-sm text-slate-500">
        <span aria-hidden>✅</span> Çalışanlar üzerinde tahsil edilmemiş nakit yok.
      </div>
    );
  }

  return (
    <div className="card space-y-2">
      <h2 className="font-semibold">Çalışan kasası — tahsil edilmemiş nakit</h2>
      {collections.map((c) => (
        <div key={c.employeeId} className="space-y-2 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{c.employeeName}</div>
              <div className="text-xs text-slate-500">{c.count} tahsilat</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-amber-700">{formatMoney(c.total)}</span>
              <button
                className="btn-secondary btn-sm"
                aria-expanded={detailFor === c.employeeId}
                onClick={() => setDetailFor(detailFor === c.employeeId ? null : c.employeeId)}
              >
                {detailFor === c.employeeId ? 'Gizle' : 'Detay'}
              </button>
              <button
                className="btn-success btn-sm"
                disabled={settleMut.isPending}
                onClick={async () => {
                  if (
                    await confirmDialog({
                      title: 'Nakit tahsil edildi mi?',
                      message: `${c.employeeName} çalışanından ${formatMoney(c.total)} nakit tahsil edildi olarak işaretlensin mi?`,
                      confirmText: 'Tahsil ettim',
                      danger: false,
                    })
                  ) {
                    settleMut.mutate(c.employeeId);
                  }
                }}
              >
                Tahsil ettim
              </button>
            </div>
          </div>
          {detailFor === c.employeeId && (
            <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900/40">
              {detail?.map((p) => (
                <div key={p.id} className="flex justify-between gap-2">
                  <span className="min-w-0">
                    {formatDate(p.paymentDate?.slice(0, 10))} · {p.customer?.name ?? 'Müşteri'}
                  </span>
                  <span className="whitespace-nowrap font-medium">{formatMoney(p.amount)}</span>
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
  employees?: StaffMember[];
  banks?: BankAccount[];
  onChanged: (balance: number) => void;
}) {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdatePaymentInput>({});
  const editable = isEditable(p, hasRole('owner'));
  const incoming = p.direction === 'incoming';

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
    // Ekstre ve çalışan kasası da bu ödemeyi içeriyordu.
    qc.invalidateQueries({ queryKey: ['ledger', customerId] });
    qc.invalidateQueries({ queryKey: ['cash-collections'] });
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

  const handleDelete = async () => {
    const extra = p.isDebtClose
      ? ' Bu bir "borç kapama" tahsilatı: kapatmada yazılan indirim de geri alınır, borç eski haline döner.'
      : '';
    if (
      await confirmDialog({
        title: 'Ödeme silinsin mi?',
        message: `${formatMoney(p.amount)} tutarındaki bu ${
          incoming ? 'tahsilat' : 'ödeme'
        } silinsin mi?${extra} Cari bakiyesi yeniden hesaplanır.`,
        confirmText: 'Sil',
        danger: true,
      })
    ) {
      deleteMut.mutate();
    }
  };

  const details = [
    p.method === 'cash' && p.receivedBy ? `👤 ${p.receivedBy.fullName}` : null,
    p.method === 'bank_transfer' && p.bankAccount ? `🏦 ${p.bankAccount.bankName}` : null,
    p.method === 'card' && p.cardBusinessName ? `💳 ${p.cardBusinessName}` : null,
    p.note ? `📝 ${p.note}` : null,
  ].filter(Boolean);

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span
              className={`badge ${
                incoming ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'
              }`}
            >
              <span aria-hidden>{incoming ? '⬇' : '⬆'}</span>
              {incoming ? 'Tahsilat' : 'Ödeme'}
            </span>
            <span>
              {METHOD_ICONS[p.method]} {METHOD_LABELS[p.method]}
            </span>
            {p.isDebtClose && (
              <span className="badge bg-amber-100 text-amber-800">borç kapama</span>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(p.paymentDate?.slice(0, 10))}
            {details.length ? ` · ${details.join(' · ')}` : ''}
          </p>
          {/* #6 Her ödemeden sonra kalan bakiye */}
          <p className="text-xs text-slate-500">
            Kalan bakiye:{' '}
            <span className={`font-medium ${balanceTone(Number(p.balanceAfter))}`}>
              {formatMoney(p.balanceAfter)}
            </span>
          </p>
        </div>
        <span
          className={`shrink-0 whitespace-nowrap text-lg font-bold ${
            incoming ? 'text-emerald-600' : 'text-orange-600'
          }`}
        >
          {formatMoney(p.amount)}
        </span>
      </div>

      {editable && !editing && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button className="btn-secondary btn-sm" onClick={startEdit}>
            Düzenle
          </button>
          <button
            className="btn-danger-soft btn-sm"
            title="Yanlışlıkla girilen bu ödemeyi geri al (sil)"
            disabled={deleteMut.isPending}
            onClick={handleDelete}
          >
            {deleteMut.isPending ? 'Siliniyor…' : 'Sil'}
          </button>
        </div>
      )}

      {deleteMut.isError && (
        <p className="mt-1 text-xs text-red-600">
          {(deleteMut.error as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Ödeme silinemedi.'}
        </p>
      )}

      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="label">Tutar</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                value={form.amount ?? ''}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </label>
            <label className="block min-w-0">
              <span className="label">Tarih</span>
              <input
                className="input"
                type="date"
                value={form.paymentDate ?? ''}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value || undefined })}
              />
            </label>
            <div className="min-w-0 sm:col-span-2">
              <span className="label">Yöntem</span>
              <MethodSegment
                compact
                value={form.method}
                onChange={(m) =>
                  setForm({
                    ...form,
                    method: m,
                    receivedById: undefined,
                    bankAccountId: undefined,
                    cardBusinessName: undefined,
                  })
                }
              />
            </div>
            {form.method === 'cash' && (
              <label className="block min-w-0">
                <span className="label">Parayı alan çalışan</span>
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
              <label className="block min-w-0">
                <span className="label">Banka hesabı</span>
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
              <label className="block min-w-0">
                <span className="label">İşletme / POS adı</span>
                <input
                  className="input"
                  value={form.cardBusinessName ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, cardBusinessName: e.target.value || undefined })
                  }
                />
              </label>
            )}
            <label className="block min-w-0 sm:col-span-2">
              <span className="label">Not</span>
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
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary btn-sm"
              disabled={!editReady || updateMut.isPending}
              onClick={() => updateMut.mutate()}
            >
              Kaydet
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setEditing(false)}>
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
function LegacyDebtClosePanel() {
  const { data: legacy } = useQuery({
    queryKey: ['legacy-debt-closings'],
    queryFn: fetchLegacyDebtClosings,
  });
  // Çalışan/banka listeleri yalnız çevrilecek kayıt varsa istenir.
  const { data: employees } = useStaff({ enabled: !!legacy?.length });
  const { data: banks } = useBankAccounts({ enabled: !!legacy?.length });

  if (!legacy?.length) return null;

  return (
    <div className="card space-y-2 border border-amber-200 bg-amber-50/40 dark:border-amber-900/50">
      <h2 className="font-semibold text-amber-800 dark:text-amber-300">
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
  employees?: StaffMember[];
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
    <div className="space-y-2 rounded-xl bg-white p-3 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0">
          <span className="font-semibold">{row.customerName}</span>{' '}
          <span className="text-slate-500">· {formatDate(row.occurredAt?.slice(0, 10))}</span>
        </span>
        <span className="font-bold">{formatMoney(row.amount)}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
        <select
          className="input"
          aria-label="Ödeme yöntemi"
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
            className="input"
            aria-label="Parayı alan çalışan"
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
            className="input"
            aria-label="Banka hesabı"
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
            className="input"
            placeholder="İşletme / POS adı"
            value={input.cardBusinessName ?? ''}
            onChange={(e) => setInput({ ...input, cardBusinessName: e.target.value || undefined })}
          />
        )}
        <input
          className="input"
          type="date"
          aria-label="Ödeme tarihi"
          value={input.paymentDate ?? ''}
          onChange={(e) => setInput({ ...input, paymentDate: e.target.value || undefined })}
        />
        <button
          className="btn-success"
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
  const { data: banks } = useBankAccounts();
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
    <div className="rounded-xl bg-slate-50 p-2 text-sm dark:bg-slate-900/40">
      <button
        type="button"
        className="text-xs font-medium text-blue-600 hover:underline"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '▲ Banka hesabı yönetimini gizle' : '▼ Banka hesabı ekle / kaldır'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {addMut.error && (
            <p className="text-xs text-red-600">
              {(addMut.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Eklenemedi (IBAN en az 10 karakter, ad-soyad gerekli).'}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
            <input
              className="input"
              placeholder="Banka adı"
              aria-label="Banka adı"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
            <input
              className="input font-mono"
              placeholder="IBAN"
              aria-label="IBAN"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={bankName.trim().length < 2 || iban.trim().length < 10}
              onClick={() =>
                addMut.mutate({ bankName: bankName.trim(), accountName: bankName.trim(), iban: iban.trim() })
              }
            >
              Ekle
            </button>
          </div>
          {banks?.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2 first:border-0"
            >
              <span className="min-w-0">
                <span className="font-medium">{b.bankName}</span>
                <span className="block break-all font-mono text-xs text-slate-500">{b.iban}</span>
              </span>
              <button
                type="button"
                className="btn-danger-soft btn-sm shrink-0"
                onClick={async () => {
                  if (
                    await confirmDialog({
                      message: `${b.bankName} hesabı silinsin mi?`,
                      confirmText: 'Sil',
                      danger: true,
                    })
                  ) {
                    delMut.mutate(b.id);
                  }
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
