import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  addCustomerLedgerEntry,
  createCustomer,
  deleteCustomer,
  fetchCustomer,
  fetchCustomerLedger,
  fetchCustomers,
  issuePortalLink,
  revokePortalLink,
  settleCustomerDebt,
  updateCustomer,
  type CreateCustomerInput,
  type CustomerFilters,
  type UpdateCustomerInput,
} from '../../api/customers.api';
import { downloadFile, openPdf } from '../../api/documents.api';
import { fetchEmployees } from '../../api/users.api';
import { fetchBankAccounts } from '../../api/bank-accounts.api';
import { useListDensity, DensityToggle } from '../../context/DensityContext';
import { Pagination } from '../../components/Pagination';
import { usePageSize } from '../../hooks/usePageSize';
import type { Customer, PaymentMethod } from '../../types';

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
  const [pageSize, setPageSize] = usePageSize('customers', 20);
  const [filters, setFilters] = useState<CustomerFilters>({
    page: 1,
    limit: pageSize,
    sort: 'balance',
  });
  const changePageSize = (n: number) => {
    setPageSize(n);
    setFilters((f) => ({ ...f, limit: n, page: 1 }));
  };
  const [showForm, setShowForm] = useState(false);
  const { mini, toggle: toggleMini } = useListDensity();

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
        <div className="flex items-center gap-2">
          <DensityToggle mini={mini} onToggle={toggleMini} />
          {!showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Yeni Müşteri
            </button>
          )}
        </div>
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
            <CustomerRow key={c.id} customer={c} mini={mini} />
          ))}
          {!data?.items.length && (
            <p className="text-slate-400">Kayıt bulunamadı.</p>
          )}

          {meta && (
            <div className="pt-2">
              <Pagination
                page={meta.page}
                pageCount={meta.pageCount}
                total={meta.total}
                pageSize={pageSize}
                onPage={goPage}
                onPageSize={changePageSize}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Cari bilgilerini düzenleme (ad, firma, telefon, e-posta, adres, VKN). */
function EditCustomerForm({
  customer,
  onDone,
}: {
  customer: Customer;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdateCustomerInput>({
    name: customer.name,
    companyName: customer.companyName,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    taxNumber: customer.taxNumber,
  });
  const mut = useMutation({
    mutationFn: () => updateCustomer(customer.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    },
  });
  const delMut = useMutation({
    mutationFn: () => deleteCustomer(customer.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    },
  });

  // #3 Silme kolay olmasın: düzenle sekmesinin içinde, iki kez onay sorar.
  function handleDelete() {
    if (
      !window.confirm(
        `"${customer.name}" carisini KALICI olarak silmek üzeresiniz. Müşterinin tüm borç/alacak geçmişi, ödemeleri, teklifleri ve satışları silinir ve raporlarda artık görünmez. Devam edilsin mi?`,
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `Son onay: "${customer.name}" ve tüm kayıtları geri alınamaz biçimde silinecek. Emin misiniz?`,
      )
    ) {
      return;
    }
    delMut.mutate();
  }

  const set = (k: keyof UpdateCustomerInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v || undefined }));
  const field = (label: string, k: keyof UpdateCustomerInput) => (
    <label className="block text-xs">
      <span className="mb-1 block text-slate-500">{label}</span>
      <input
        className="input"
        value={(form[k] as string) ?? ''}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-2">
      <div className="grid grid-cols-2 gap-2">
        {field('Ad / Ünvan', 'name')}
        {field('Firma', 'companyName')}
        {field('Telefon', 'phone')}
        {field('E-posta', 'email')}
        {field('Vergi No', 'taxNumber')}
        {field('Adres', 'address')}
      </div>
      {mut.isError && (
        <p className="text-xs text-red-600">Güncellenemedi.</p>
      )}
      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={!form.name || mut.isPending}
          onClick={() => mut.mutate()}
        >
          Kaydet
        </button>
        <button className="btn" onClick={onDone}>
          Vazgeç
        </button>
      </div>

      {/* #3 Tehlikeli bölge: müşteriyi kalıcı sil (iki onay). */}
      <div className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 p-2">
        <p className="text-xs font-semibold text-red-700">Tehlikeli bölge</p>
        <p className="text-xs text-red-600">
          Müşteriyi kalıcı siler; borç/alacak geçmişi, ödemeleri, teklif ve
          satışları tamamen kaldırılır ve raporlarda görünmez.
        </p>
        {delMut.isError && (
          <p className="text-xs text-red-700">
            {(delMut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Silinemedi. Tekrar deneyin.'}
          </p>
        )}
        <button
          className="btn bg-red-600 text-xs text-white"
          disabled={delMut.isPending}
          onClick={handleDelete}
        >
          {delMut.isPending ? 'Siliniyor…' : 'Müşteriyi kalıcı sil'}
        </button>
      </div>
    </div>
  );
}

/**
 * 🔗 Müşteri portal linki paneli: link üret → kopyala / WhatsApp'tan gönder /
 * iptal et. Link, uygulamanın kendi adresi üzerinden kurulur (her ortamda doğru).
 */
function PortalLinkPanel({ customer }: { customer: Customer }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const issueMut = useMutation({
    mutationFn: () => issuePortalLink(customer.id),
    onSuccess: (res) => {
      setLink(`${window.location.origin}/portal/${res.token}`);
      setCopied(false);
    },
  });
  const revokeMut = useMutation({
    mutationFn: () => revokePortalLink(customer.id),
    onSuccess: () => setLink(null),
  });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Pano izni yoksa metni seçili input üzerinden elle kopyalasın.
      setCopied(false);
    }
  };

  const waHref = link
    ? `https://wa.me/${(customer.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(
        `Merhaba ${customer.name}, güncel hesap ekstrenizi buradan görüntüleyebilirsiniz: ${link}`,
      )}`
    : '#';

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-700">
      <p className="text-xs text-slate-500">
        Müşteri bu linkle borcunu ve ekstresini kendisi görüntüler (giriş gerekmez).
        Link üretmek eskisini geçersiz kılar; "İptal et" tüm erişimi kapatır.
      </p>
      {issueMut.isError && (
        <p className="text-xs text-red-600">Link üretilemedi. Tekrar deneyin.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn bg-indigo-600 text-white"
          disabled={issueMut.isPending}
          onClick={() => issueMut.mutate()}
        >
          {link ? 'Yeni link üret' : 'Link üret'}
        </button>
        {link && (
          <>
            <input
              className="input min-w-0 flex-1 text-xs"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
            />
            <button className="btn bg-slate-100" onClick={copy}>
              {copied ? '✓ Kopyalandı' : 'Kopyala'}
            </button>
            <a
              className="btn bg-emerald-600 text-white"
              href={waHref}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <button
              className="btn bg-red-50 text-red-600"
              disabled={revokeMut.isPending}
              onClick={() => {
                if (confirm('Portal erişimi iptal edilsin mi? Link geçersizleşir.')) {
                  revokeMut.mutate();
                }
              }}
            >
              İptal et
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Tek cari satırı: bakiye + ekstre + düzenle/sil. */
function CustomerRow({ customer, mini }: { customer: Customer; mini?: boolean }) {
  const [openStatement, setOpenStatement] = useState(false);
  const [editing, setEditing] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);

  return (
    <div className={mini ? 'card !p-2' : 'card'}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium">
            {customer.name}
            {mini && (customer.companyName || customer.phone) ? (
              <span className="ml-2 text-xs font-normal text-slate-400">
                {customer.companyName ?? customer.phone}
              </span>
            ) : null}
          </h3>
          {!mini && (
            <p className="text-sm text-slate-500">
              {customer.companyName ?? customer.phone ?? '—'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <button
            className="btn bg-slate-100 text-xs"
            title="Müşteri portal linki (borç/ekstre görüntüleme)"
            onClick={() => setPortalOpen((p) => !p)}
          >
            🔗 Portal
          </button>
          <button className="btn bg-slate-100 text-xs" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Vazgeç' : 'Düzenle'}
          </button>
        </div>
      </div>
      {portalOpen && <PortalLinkPanel customer={customer} />}
      {editing && (
        <EditCustomerForm customer={customer} onDone={() => setEditing(false)} />
      )}
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
  discount: 'İndirim',
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
  // Yetkili bakiye backend'den (settle bunu esas alır); ledger toplamıyla
  // ıraksarsa bile borç kapatma doğru çalışsın.
  const { data: freshCustomer } = useQuery({
    queryKey: ['customers', 'one', customerId],
    queryFn: () => fetchCustomer(customerId),
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
      qc.invalidateQueries({ queryKey: ['customers', 'one', customerId] });
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
  const ledgerBalance = computed.length ? computed[computed.length - 1].running : 0;
  // Borç kapatma için backend'in cache'li bakiyesini esas al (settle onu kullanır);
  // henüz gelmemişse ledger toplamına düş.
  const currentBalance =
    freshCustomer != null ? Number(freshCustomer.currentBalance) : ledgerBalance;

  // #5 Borç kapatma: müşterinin ödediği tutarı (varsa) ve ödeme yöntemini gir.
  // Tahsil edilen tutar gerçek bir ödeme olarak kaydedilir (ödeme geçmişinde
  // görünür), kalan fark "İndirim" olarak ekstreye işlenir ve borç kapanır.
  // Hiç para almadan kapatmak için tutarı 0 (boş) bırakın → tamamı indirim.
  const [paid, setPaid] = useState('');
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('cash');
  const [settleReceivedById, setSettleReceivedById] = useState('');
  const [settleBankAccountId, setSettleBankAccountId] = useState('');
  const [settleCardBusiness, setSettleCardBusiness] = useState('');
  const [settleDate, setSettleDate] = useState(today);
  const paidNum = Number(paid) || 0;
  const discountAmount = Math.max(
    0,
    Math.round((currentBalance - paidNum) * 100) / 100,
  );
  const { data: settleEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
  });
  const { data: settleBanks } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: fetchBankAccounts,
  });
  // Para giriliyorsa yöntem-özel alan zorunlu (ödeme formundaki gibi).
  const settleMethodReady =
    paidNum <= 0 ||
    (settleMethod === 'cash'
      ? !!settleReceivedById
      : settleMethod === 'bank_transfer'
        ? !!settleBankAccountId
        : true);
  const discountMut = useMutation({
    mutationFn: () =>
      settleCustomerDebt(customerId, {
        paidAmount: paidNum,
        paymentDate: settleDate || undefined,
        ...(paidNum > 0
          ? {
              method: settleMethod,
              receivedById:
                settleMethod === 'cash' ? settleReceivedById : undefined,
              bankAccountId:
                settleMethod === 'bank_transfer'
                  ? settleBankAccountId
                  : undefined,
              cardBusinessName:
                settleMethod === 'card'
                  ? settleCardBusiness || undefined
                  : undefined,
            }
          : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ledger', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', 'one', customerId] });
      qc.invalidateQueries({ queryKey: ['payments', customerId] });
      setPaid('');
      setSettleReceivedById('');
      setSettleBankAccountId('');
      setSettleCardBusiness('');
    },
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
          onClick={() => openPdf(`/customers/${customerId}/statement`)}
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

      {/* #5 Borcu kapat: tahsil edilen tutarı ve yöntemini gir; kalan fark
          "İndirim" olur. Hiç para almadan kapatmak için tutarı boş/0 bırakın. */}
      {currentBalance > 0 && (
        <div className="space-y-2 border-t border-slate-200 pt-2">
          <p className="text-xs font-medium text-slate-600">
            Borç kapatma · Güncel borç: {currency.format(currentBalance)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-36"
              type="number"
              min={0}
              placeholder="Tahsil edilen (0 = para yok)"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
            />
            <button
              className="btn bg-slate-100 text-xs"
              title="Kalan borcun tamamını tahsilat olarak yaz (indirim yok)"
              onClick={() => setPaid(String(currentBalance))}
            >
              Tümü
            </button>
            <input
              className="input w-auto"
              type="date"
              value={settleDate}
              onChange={(e) => setSettleDate(e.target.value)}
            />
            <span className="text-xs text-slate-500">
              İndirim:{' '}
              <span className="font-semibold text-amber-600">
                {currency.format(discountAmount)}
              </span>
            </span>
          </div>

          {/* Para giriliyorsa ödeme yöntemi (ödeme formundaki gibi). */}
          {paidNum > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto"
                value={settleMethod}
                onChange={(e) => setSettleMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">Nakit</option>
                <option value="bank_transfer">Havale/EFT</option>
                <option value="card">Kart</option>
              </select>
              {settleMethod === 'cash' && (
                <select
                  className="input w-auto"
                  value={settleReceivedById}
                  onChange={(e) => setSettleReceivedById(e.target.value)}
                >
                  <option value="">Parayı alan çalışan…</option>
                  {settleEmployees?.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
                </select>
              )}
              {settleMethod === 'bank_transfer' && (
                <select
                  className="input w-auto"
                  value={settleBankAccountId}
                  onChange={(e) => setSettleBankAccountId(e.target.value)}
                >
                  <option value="">Banka hesabı…</option>
                  {settleBanks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName}
                      {b.iban ? ` · ${b.iban}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {settleMethod === 'card' && (
                <input
                  className="input w-auto flex-1"
                  placeholder="İşletme / POS adı"
                  value={settleCardBusiness}
                  onChange={(e) => setSettleCardBusiness(e.target.value)}
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn bg-amber-600 text-white"
              disabled={!settleMethodReady || discountMut.isPending}
              onClick={() => {
                if (
                  paidNum <= 0 &&
                  !window.confirm(
                    `Hiç para alınmadan ${currency.format(currentBalance)} borç kapatılacak (tamamı indirim). Devam edilsin mi?`,
                  )
                ) {
                  return;
                }
                discountMut.mutate();
              }}
            >
              {paidNum > 0 ? 'Borcu kapat (tahsilatla)' : 'Borcu kapat (para almadan)'}
            </button>
            {paidNum <= 0 && (
              <span className="text-xs text-slate-400">
                Tutar 0 → gerçek ödeme oluşmaz, borç indirimle kapanır.
              </span>
            )}
          </div>
          {discountMut.isError && (
            <p className="text-xs text-red-600">
              {(discountMut.error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message ?? 'İşlem başarısız.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
