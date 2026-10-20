import { Can } from '../../components/Can';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  addCustomerLedgerEntry,
  createCustomer,
  deleteCustomer,
  deleteCustomerLedgerEntry,
  fetchCustomer,
  fetchCustomerStatement,
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
import { useBankAccounts, useDisplaySettings, useStaff } from '../../hooks/useReferenceData';
import { useAuth } from '../../context/AuthContext';
import { useListDensity, DensityToggle } from '../../context/DensityContext';
import { Pagination } from '../../components/Pagination';
import { confirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { Filters } from '../../components/ui/Filters';
import { SearchInput } from '../../components/ui/SearchInput';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { usePageSize } from '../../hooks/usePageSize';
import { useUrlParam } from '../../hooks/useUrlParam';
import { formatDate, formatMoney } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { Customer, CustomerLedgerEntry, PaymentMethod } from '../../types';

const EMPTY: CreateCustomerInput = { name: '' };

/** Bakiye rengi: borç kırmızı, alacak yeşil, sıfır soluk. */
function balanceTone(balance: number): string {
  if (balance > 0) return 'text-red-600';
  if (balance < 0) return 'text-emerald-600';
  return 'text-slate-400';
}

function balanceLabel(balance: number): string {
  if (balance > 0) return 'borç';
  if (balance < 0) return 'alacak';
  return 'bakiye yok';
}

/** tel: bağlantısı için yalnız rakam ve + kalsın. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Nakit' },
  { value: 'bank_transfer', label: 'Havale/EFT' },
  { value: 'card', label: 'Kart' },
];

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

  // Enter ile de kaydedilir (ad boşken ya da kayıt sürerken değil).
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || createMut.isPending) return;
    createMut.mutate(form);
  };

  return (
    <form className="card space-y-4" onSubmit={submit} noValidate>
      <div>
        <h2 className="text-base font-semibold">Yeni müşteri</h2>
        <p className="text-xs text-slate-500">
          Yalnızca ad zorunlu; diğer bilgiler sonradan "Düzenle" ile eklenebilir.
        </p>
      </div>
      {createMut.error && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {(createMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Müşteri oluşturulamadı.'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">
            Ad Soyad / Ünvan <span className="text-red-600">*</span>
          </span>
          <input
            className="input"
            placeholder="Ad Soyad"
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="label">Firma</span>
          <input
            className="input"
            placeholder="Firma Adı"
            value={form.companyName ?? ''}
            onChange={(e) => setForm({ ...form, companyName: e.target.value || undefined })}
          />
        </label>
        <label className="block">
          <span className="label">Telefon</span>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            placeholder="Telefon"
            value={form.phone ?? ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value || undefined })}
          />
        </label>
        <label className="block">
          <span className="label">E-posta</span>
          <input
            className="input"
            type="email"
            inputMode="email"
            placeholder="E-posta"
            value={form.email ?? ''}
            onChange={(e) => setForm({ ...form, email: e.target.value || undefined })}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Adres</span>
          <input
            className="input"
            placeholder="Adres"
            value={form.address ?? ''}
            onChange={(e) => setForm({ ...form, address: e.target.value || undefined })}
          />
        </label>
        <label className="block">
          <span className="label">Vergi No</span>
          <input
            className="input"
            inputMode="numeric"
            placeholder="Vergi No"
            value={form.taxNumber ?? ''}
            onChange={(e) => setForm({ ...form, taxNumber: e.target.value || undefined })}
          />
        </label>
        <label className="block">
          <span className="label">Açılış bakiyesi (varsa mevcut borç)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder="Açılış Bakiyesi"
            value={form.openingBalance ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                openingBalance: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn-primary"
          disabled={!form.name || createMut.isPending}
        >
          Kaydet
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          İptal
        </button>
      </div>
    </form>
  );
}

/**
 * Cari listesi + borç durumuna göre filtreleme ve sıralama.
 */
export function CustomersListPage() {
  const [pageSize, setPageSize] = usePageSize('customers', 20);
  // Ekranda düzenlenen (taslak) filtreler ile SORGULANAN filtreler ayrıdır:
  // liste yalnızca "Sorgula" ile çalışır, sayfa açılır açılmaz tüm cariler
  // dökülmez.
  const [draft, setDraft] = useState<CustomerFilters>({
    page: 1,
    limit: pageSize,
    sort: 'balance',
  });
  const [applied, setApplied] = useState<CustomerFilters | null>(null);

  const runQuery = (patch: Partial<CustomerFilters> = {}) => {
    const next = { ...draft, ...patch, page: 1 };
    setDraft(next);
    setApplied(next);
  };
  const changePageSize = (n: number) => {
    setPageSize(n);
    setDraft((f) => ({ ...f, limit: n, page: 1 }));
    setApplied((f) => (f ? { ...f, limit: n, page: 1 } : f));
  };
  const [showForm, setShowForm] = useState(false);
  // Hızlı aramadan gelen "ekstresini aç" isteği: satır çizilince açılır.
  const [openId, setOpenId] = useState<string | null>(null);
  const { mini, toggle: toggleMini } = useListDensity();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customers', applied],
    queryFn: () => fetchCustomers(applied!),
    // Sorgula'ya basılmadan hiçbir istek atılmaz.
    enabled: applied !== null,
  });

  // Hızlı arama (Ctrl+K) bağlantıları — kullanıcının kendi isteği olduğundan
  // sorgu burada çalıştırılır:
  //   ?new=1            → yeni müşteri formu
  //   ?q=Ad&open=<id>   → adı arar ve o müşterinin ekstresini açar
  //   ?debt=1           → yalnızca borçlular, borca göre
  useUrlParam('new', () => setShowForm(true));
  useUrlParam('q', (q) => runQuery({ search: q || undefined }));
  useUrlParam('open', (id) => setOpenId(id));
  useUrlParam('debt', () => runQuery({ hasDebt: true, sort: 'balance' }));

  // Yalnız ?open geldiyse (arama yoksa) müşterinin adıyla sorgula.
  useEffect(() => {
    if (!openId || applied) return;
    let cancelled = false;
    fetchCustomer(openId)
      .then((c) => {
        if (!cancelled) runQuery({ search: c.name });
      })
      .catch(() => {
        if (!cancelled) setOpenId(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, applied]);

  // Aranan müşteri sonuçlarda yoksa bekleyen isteği bırak.
  useEffect(() => {
    if (!openId || !data || isFetching) return;
    if (!data.items.some((c) => c.id === openId)) setOpenId(null);
  }, [openId, data, isFetching]);

  const set = (patch: Partial<CustomerFilters>) =>
    setDraft((f) => ({ ...f, ...patch, page: 1 }));
  const goPage = (page: number) => {
    setDraft((f) => ({ ...f, page }));
    setApplied((f) => (f ? { ...f, page } : f));
  };
  const meta = data?.meta;

  const activeCount =
    (draft.from || draft.to ? 1 : 0) +
    (draft.hasDebt ? 1 : 0) +
    (draft.sort && draft.sort !== 'balance' ? 1 : 0);
  // Filtreleri sıfırla (arama metni kalır). Liste zaten sorgulanmışsa yeni
  // hali hemen görünsün; sorgulanmamışsa yine Sorgula beklenir.
  const clearFilters = () => {
    const patch: Partial<CustomerFilters> = {
      from: undefined,
      to: undefined,
      hasDebt: undefined,
      sort: 'balance',
    };
    if (applied) runQuery(patch);
    else set(patch);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Müşteriler / Cari"
        icon="👥"
        subtitle="Müşteriyi arayıp Sorgula'ya basın; bakiye, ekstre ve portal linki satırdan açılır."
        actions={
          <>
            <DensityToggle mini={mini} onToggle={toggleMini} />
            {!showForm && (
              <Can module="customers" level="write">
                <button
                  className="btn-primary"
                  data-hotkey="n"
                  title="Yeni müşteri (N)"
                  onClick={() => setShowForm(true)}
                >
                  + Yeni Müşteri
                </button>
              </Can>
            )}
          </>
        }
      />

      {showForm && (
        <Can module="customers" level="write">
          <NewCustomerForm onClose={() => setShowForm(false)} />
        </Can>
      )}

      <Filters
        search={
          <SearchInput
            placeholder="Ara (ad, firma, telefon)…"
            value={draft.search ?? ''}
            onChange={(v) => set({ search: v || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runQuery();
            }}
            enterKeyHint="search"
          />
        }
        activeCount={activeCount}
        onClear={clearFilters}
      >
        <DateRangeFilter
          value={{ from: draft.from, to: draft.to }}
          onChange={(r) => set({ from: r.from, to: r.to })}
          fromLabel="Kayıt başlangıç"
          toLabel="Kayıt bitiş"
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm">
            <input
              type="checkbox"
              checked={!!draft.hasDebt}
              onChange={(e) => set({ hasDebt: e.target.checked || undefined })}
            />
            Yalnızca borçlular
          </label>
          <label className="block min-w-[10rem]">
            <span className="label">Sıralama</span>
            <select
              className="input"
              value={draft.sort}
              onChange={(e) =>
                set({ sort: e.target.value as CustomerFilters['sort'] })
              }
            >
              <option value="balance">Borca göre</option>
              <option value="name">Ada göre</option>
              <option value="recent">Son hareket</option>
            </select>
          </label>
        </div>
      </Filters>

      {/* Liste yalnızca burada çalışır — sayfa açılışında sorgu atılmaz.
          Düğmeler filtre kutusunun dışında: telefonda filtreler kapalıyken de
          görünür kalsın. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary flex-1 sm:flex-none sm:px-6"
          disabled={isFetching}
          onClick={() => runQuery()}
        >
          {isFetching ? 'Sorgulanıyor…' : '🔍 Sorgula'}
        </button>
        <button
          className="btn-secondary"
          title="Filtresiz, borca göre tüm cariler"
          onClick={() => runQuery({ search: undefined, hasDebt: undefined })}
        >
          Tümünü listele
        </button>
        <button
          className="btn-ghost"
          title="Aramayı ve filtreleri sıfırla, listeyi boşalt"
          onClick={() => {
            const cleared: CustomerFilters = {
              page: 1,
              limit: pageSize,
              sort: 'balance',
            };
            setDraft(cleared);
            setApplied(null);
          }}
        >
          Temizle
        </button>
      </div>

      {applied === null ? (
        <EmptyState
          icon="🔒"
          title={
            <>
              Aramak istediğiniz müşteriyi yazıp <b>Sorgula</b>'ya basın.
            </>
          }
          hint="Liste, siz sorgulayana kadar boş kalır. Ekran müşteriye dönükken diğer cariler görünmesin diye böyledir."
          action={
            <button
              className="btn-secondary btn-sm"
              onClick={() => runQuery({ hasDebt: true, sort: 'balance' })}
            >
              ⚠ Borçluları listele
            </button>
          }
        />
      ) : isLoading ? (
        <LoadingBlock rows={3} />
      ) : (
        <div className="space-y-2">
          {meta && data?.items.length ? (
            <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
              <span>
                {meta.total} müşteri
                {applied.hasDebt ? ' · yalnızca borçlular' : ''}
                {applied.search ? ` · "${applied.search}"` : ''}
              </span>
              {isFetching && <Spinner className="text-blue-600" />}
            </div>
          ) : null}
          {data?.items.map((c) => (
            <CustomerRow
              key={c.id}
              customer={c}
              mini={mini}
              autoOpen={c.id === openId}
              onAutoOpened={() => setOpenId(null)}
            />
          ))}
          {!data?.items.length && (
            <EmptyState
              compact
              icon="🔍"
              title="Kayıt bulunamadı."
              hint="Aramayı kısaltın, yazımı kontrol edin ya da filtreleri temizleyin."
              action={
                <>
                  {activeCount > 0 && (
                    <button className="btn-secondary btn-sm" onClick={clearFilters}>
                      Filtreleri temizle
                    </button>
                  )}
                  {!showForm && (
                    <Can module="customers" level="write">
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => setShowForm(true)}
                      >
                        Yeni müşteri ekle
                      </button>
                    </Can>
                  )}
                </>
              }
            />
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
  async function handleDelete() {
    if (
      !(await confirmDialog({
        title: 'Müşteri kalıcı silinsin mi?',
        message: `"${customer.name}" carisini KALICI olarak silmek üzeresiniz. Müşterinin tüm borç/alacak geçmişi, ödemeleri, teklifleri ve satışları silinir ve raporlarda artık görünmez. Devam edilsin mi?`,
        confirmText: 'Devam et',
        danger: true,
      }))
    ) {
      return;
    }
    if (
      !(await confirmDialog({
        title: 'Son onay',
        message: `"${customer.name}" ve tüm kayıtları geri alınamaz biçimde silinecek. Emin misiniz?`,
        confirmText: 'Kalıcı olarak sil',
        danger: true,
      }))
    ) {
      return;
    }
    delMut.mutate();
  }

  const set = (k: keyof UpdateCustomerInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v || undefined }));
  const field = (
    label: string,
    k: keyof UpdateCustomerInput,
    extra: { type?: string; inputMode?: 'tel' | 'email' | 'numeric'; required?: boolean } = {},
  ) => (
    <label className="block">
      <span className="label">
        {label}
        {extra.required && <span className="text-red-600"> *</span>}
      </span>
      <input
        className="input"
        type={extra.type}
        inputMode={extra.inputMode}
        value={(form[k] as string) ?? ''}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3">
      <h4 className="text-sm font-semibold">Bilgileri düzenle</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field('Ad / Ünvan', 'name', { required: true })}
        {field('Firma', 'companyName')}
        {field('Telefon', 'phone', { type: 'tel', inputMode: 'tel' })}
        {field('E-posta', 'email', { type: 'email', inputMode: 'email' })}
        {field('Vergi No', 'taxNumber', { inputMode: 'numeric' })}
        {field('Adres', 'address')}
      </div>
      {mut.isError && (
        <p className="text-xs text-red-600">Güncellenemedi.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={!form.name || mut.isPending}
          onClick={() => mut.mutate()}
        >
          Kaydet
        </button>
        <button className="btn-secondary" onClick={onDone}>
          Vazgeç
        </button>
      </div>

      {/* #3 Tehlikeli bölge: müşteriyi kalıcı sil (iki onay). */}
      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">⚠ Tehlikeli bölge</p>
        <p className="text-xs text-red-600 dark:text-red-300">
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
          className="btn-danger btn-sm"
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
      toast.success('Bağlantı kopyalandı');
    } catch {
      // Pano izni yoksa metni seçili input üzerinden elle kopyalasın.
      setCopied(false);
      toast.warning('Kopyalanamadı', 'Bağlantıyı kutudan seçip elle kopyalayın.');
    }
  };

  const waHref = link
    ? `https://wa.me/${(customer.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(
        `Merhaba ${customer.name}, güncel hesap ekstrenizi buradan görüntüleyebilirsiniz: ${link}`,
      )}`
    : '#';

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
      <h4 className="text-sm font-semibold">🔗 Müşteri portal linki</h4>
      <p className="text-xs text-slate-500">
        Müşteri bu linkle borcunu ve ekstresini kendisi görüntüler (giriş gerekmez).
        Link üretmek eskisini geçersiz kılar; "İptal et" tüm erişimi kapatır.
      </p>
      {issueMut.isError && (
        <p className="text-xs text-red-600">Link üretilemedi. Tekrar deneyin.</p>
      )}
      {link && (
        <input
          className="input font-mono text-xs md:text-xs"
          readOnly
          value={link}
          aria-label="Portal linki"
          onFocus={(e) => e.target.select()}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={link ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
          disabled={issueMut.isPending}
          onClick={() => issueMut.mutate()}
        >
          {issueMut.isPending ? 'Üretiliyor…' : link ? 'Yeni link üret' : 'Link üret'}
        </button>
        {link && (
          <>
            <button className="btn-primary btn-sm" onClick={copy}>
              {copied ? '✓ Kopyalandı' : 'Kopyala'}
            </button>
            <a
              className="btn-success btn-sm"
              href={waHref}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <button
              className="btn-danger-soft btn-sm"
              disabled={revokeMut.isPending}
              onClick={async () => {
                if (
                  await confirmDialog({
                    message: 'Portal erişimi iptal edilsin mi? Link geçersizleşir.',
                    confirmText: 'İptal et',
                    danger: true,
                  })
                ) {
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
function CustomerRow({
  customer,
  mini,
  autoOpen,
  onAutoOpened,
}: {
  customer: Customer;
  mini?: boolean;
  /** Hızlı aramadan gelindi: ekstreyi açıp satırı görünür alana kaydır. */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const [openStatement, setOpenStatement] = useState(false);
  const [editing, setEditing] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const balance = Number(customer.currentBalance);

  useEffect(() => {
    if (!autoOpen) return;
    setOpenStatement(true);
    setFlash(true);
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  // Vurgulanan satır görünür alana kayar; vurgu birkaç saniyede söner.
  useEffect(() => {
    if (!flash) return;
    const raf = requestAnimationFrame(() =>
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    const t = window.setTimeout(() => setFlash(false), 2500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [flash]);

  const actions = (
    <div className={`flex flex-wrap items-center gap-2 ${mini ? '' : 'mt-3'}`}>
      <button
        className={openStatement ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        aria-expanded={openStatement}
        onClick={() => setOpenStatement((o) => !o)}
      >
        {openStatement ? 'Kapat' : 'Ekstre'}
      </button>
      <Can module="payments" level="write">
        <Link
          className="btn-secondary btn-sm"
          to={`/payments?customer=${customer.id}`}
          title="Bu müşteriden tahsilat al"
        >
          💰 Tahsilat
        </Link>
      </Can>
      <button
        className={portalOpen ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        title="Müşteri portal linki (borç/ekstre görüntüleme)"
        aria-expanded={portalOpen}
        onClick={() => setPortalOpen((p) => !p)}
      >
        🔗 Portal
      </button>
      <button
        className={editing ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        aria-expanded={editing}
        onClick={() => setEditing((e) => !e)}
      >
        {editing ? 'Vazgeç' : 'Düzenle'}
      </button>
    </div>
  );

  return (
    <div
      ref={rowRef}
      className={`card scroll-mt-3 transition-shadow ${mini ? '!p-2' : ''} ${
        flash ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      {mini ? (
        // Mini görünüm: ad, bakiye ve düğmeler tek satırda (sığmazsa sarılır).
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">
              {customer.name}
              {customer.companyName ? (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {customer.companyName}
                </span>
              ) : customer.phone ? (
                <a
                  href={telHref(customer.phone)}
                  className="ml-2 text-xs font-normal text-blue-600 hover:underline"
                >
                  {customer.phone}
                </a>
              ) : null}
            </h3>
          </div>
          <span className={`whitespace-nowrap font-bold ${balanceTone(balance)}`}>
            {formatMoney(balance)}
          </span>
          {actions}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-semibold">{customer.name}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                {customer.companyName && (
                  <span className="min-w-0 break-words">🏢 {customer.companyName}</span>
                )}
                {customer.phone && (
                  <a
                    href={telHref(customer.phone)}
                    className="inline-flex min-h-[28px] items-center text-blue-600 hover:underline"
                    title="Ara"
                  >
                    📞 {customer.phone}
                  </a>
                )}
                {!customer.companyName && !customer.phone && <span>—</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`text-lg font-bold leading-tight ${balanceTone(balance)}`}>
                {formatMoney(balance)}
              </div>
              <div className="text-xs text-slate-500">{balanceLabel(balance)}</div>
            </div>
          </div>
          {actions}
        </>
      )}
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

/** Ekstrede hareket kaynağı rozet renkleri. */
const SOURCE_BADGES: Record<string, string> = {
  opening: 'bg-slate-100 text-slate-700',
  processing: 'bg-blue-100 text-blue-800',
  sale: 'bg-indigo-100 text-indigo-800',
  payment: 'bg-emerald-100 text-emerald-800',
  discount: 'bg-amber-100 text-amber-800',
  manual_adjustment: 'bg-purple-100 text-purple-800',
};

/** Elle girildiği için ekstreden geri alınabilen hareket kaynakları. */
const REVERSIBLE_SOURCES = ['payment', 'discount', 'manual_adjustment'];
/** Çalışan bir hareketi kaç gün içinde geri alabilir (Sahip için sınır yok). */
const UNDO_WINDOW_DAYS = 3;

/**
 * Bir ekstre satırının geri alınıp alınamayacağı (backend de aynı kuralı
 * uygular; burada yalnızca düğmeyi göstermek/gizlemek için).
 */
function undoBlockReason(
  entry: CustomerLedgerEntry,
  isOwner: boolean,
): string | null {
  if (!REVERSIBLE_SOURCES.includes(entry.sourceType)) {
    return 'Bu hareket işleme/satış/açılış kaydından doğar; ilgili kaydı silin.';
  }
  if (entry.sourceType === 'manual_adjustment' && !isOwner) {
    return 'Manuel hareketi yalnızca İşletme Sahibi geri alabilir.';
  }
  if (isOwner) return null;
  const created = entry.createdAt ? new Date(entry.createdAt).getTime() : null;
  if (
    created == null ||
    Date.now() - created > UNDO_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ) {
    return `Yalnızca son ${UNDO_WINDOW_DAYS} gün içinde girilen hareketler geri alınabilir; İşletme Sahibi'ne başvurun.`;
  }
  return null;
}

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
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  // "Geri al" düğmeleri varsayılan olarak GİZLİDİR: ekstre ekranı müşteriye
  // gösterildiğinde "borcum siliniyor" gibi yanlış anlaşılmasın. Ayarlar ›
  // Görünüm'den açılır.
  const { data: display } = useDisplaySettings();
  const showUndo = display?.showLedgerUndo === true;
  const today = new Date().toISOString().slice(0, 10);
  const [entryType, setEntryType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState('');

  // Dönem seçimi: varsayılan olarak borcun en son kapandığı andan bugüne.
  // "Tümü" tüm geçmişi, tarih alanları serbest aralığı gösterir (kapanmadan
  // önceki döneme de bakılabilir).
  const [scope, setScope] = useState<'since-settlement' | 'all'>(
    'since-settlement',
  );
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  // Yalnız arayüz: "Tarih aralığı seç…" seçildi ama henüz tarih girilmedi.
  const [customPicked, setCustomPicked] = useState(false);
  const isCustom = customPicked || !!rangeFrom || !!rangeTo;
  const statementQuery = {
    ...(rangeFrom ? { from: rangeFrom } : {}),
    ...(rangeTo ? { to: rangeTo } : {}),
    ...(rangeFrom ? {} : { scope }),
  };
  // CSV/PDF bağlantıları da ekrandakiyle aynı dönemi çıkarsın.
  const statementParams = (() => {
    const params = new URLSearchParams(
      Object.entries(statementQuery).filter(([, v]) => v) as [string, string][],
    );
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  })();

  const { data: statement, isLoading: statementLoading } = useQuery({
    queryKey: ['ledger', customerId, statementQuery],
    queryFn: () => fetchCustomerStatement(customerId, statementQuery),
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

  // Yanlış girilen hareketi geri al (ödeme/indirim/manuel). Ödemeye bağlı
  // hareketlerde ödemenin kendisi de silinir → ödeme geçmişini de tazele.
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const undoMut = useMutation({
    mutationFn: (entryId: string) =>
      deleteCustomerLedgerEntry(customerId, entryId),
    onSettled: () => setUndoingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ledger', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', 'one', customerId] });
      qc.invalidateQueries({ queryKey: ['payments', customerId] });
      qc.invalidateQueries({ queryKey: ['cash-collections'] });
    },
  });

  async function undoEntry(entry: CustomerLedgerEntry) {
    const label = SOURCE_LABELS[entry.sourceType] ?? entry.sourceType;
    const extra =
      entry.sourceType === 'payment' && entry.sourceId
        ? ' Bu hareketin ödeme kaydı da silinir; borç kapatma indirimi varsa o da geri alınır.'
        : '';
    if (
      !(await confirmDialog({
        title: 'Hareket geri alınsın mı?',
        message: `${formatDate(entry.occurredAt?.slice(0, 10))} tarihli "${label}" hareketi (${formatMoney(
          entry.amount,
        )}) geri alınacak.${extra} Cari bakiyesi yeniden hesaplanır. Devam edilsin mi?`,
        confirmText: 'Geri al',
        danger: true,
      }))
    ) {
      return;
    }
    setUndoingId(entry.id);
    undoMut.mutate(entry.id);
  }

  // Hareketler backend'den kronolojik ve yürüyen bakiyesi hesaplanmış gelir.
  const computed = (statement?.entries ?? []).map((e) => ({
    ...e,
    running: Number(e.balanceAfter),
  }));
  const ledgerBalance = statement?.closingBalance ?? 0;
  // Borç kapatma için backend'in cache'li bakiyesini esas al (settle onu kullanır);
  // henüz gelmemişse ledger toplamına düş.
  const currentBalance =
    freshCustomer != null ? Number(freshCustomer.currentBalance) : ledgerBalance;
  // Yalnız gösterim: listelenen dönemin borç/ödeme toplamları.
  const periodDebit = computed.reduce(
    (s, e) => s + (e.entryType === 'debit' ? Number(e.amount) : 0),
    0,
  );
  const periodCredit = computed.reduce(
    (s, e) => s + (e.entryType === 'credit' ? Number(e.amount) : 0),
    0,
  );

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
  // Çalışan/banka listeleri yalnız borç kapatma formunda tahsil edilen tutar
  // girilip ilgili yöntem seçilince gerekir (ekstre her açılışta istemez).
  const settleNeedsMethod = currentBalance > 0 && paidNum > 0;
  const { data: settleEmployees } = useStaff({
    enabled: settleNeedsMethod && settleMethod === 'cash',
  });
  const { data: settleBanks } = useBankAccounts({
    enabled: settleNeedsMethod && settleMethod === 'bank_transfer',
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

  const colCount = showUndo ? 6 : 5;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3">
      {/* Dönem seçimi — çıktılar (CSV/PDF) da bu dönemi kullanır. */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="block min-w-0 flex-1 sm:max-w-xs">
          <span className="label">Ekstre dönemi</span>
          <select
            className="input"
            value={isCustom ? 'custom' : scope}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'custom') {
                // Serbest aralığa geç: başlangıcı son kapatma tarihine kur.
                setCustomPicked(true);
                setRangeFrom(statement?.lastSettledAt?.slice(0, 10) ?? '');
                return;
              }
              setCustomPicked(false);
              setRangeFrom('');
              setRangeTo('');
              setScope(v as 'since-settlement' | 'all');
            }}
          >
            <option value="since-settlement">Son borç kapatmadan bugüne</option>
            <option value="all">Tüm hareketler</option>
            <option value="custom">Tarih aralığı seç…</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            className="btn-secondary btn-sm"
            title="Ekstreyi CSV (Excel) olarak indir"
            onClick={() =>
              downloadFile(
                `/customers/${customerId}/statement.csv${statementParams}`,
                `ekstre-${fileSlug}.csv`,
              )
            }
          >
            ⬇ CSV
          </button>
          <button
            className="btn-secondary btn-sm"
            title="Ekstreyi PDF olarak aç / yazdır"
            onClick={() =>
              openPdf(`/customers/${customerId}/statement${statementParams}`)
            }
          >
            🖨 PDF
          </button>
        </div>
      </div>
      {isCustom && (
        <DateRangeFilter
          value={{ from: rangeFrom || undefined, to: rangeTo || undefined }}
          onChange={(r) => {
            setRangeFrom(r.from ?? '');
            setRangeTo(r.to ?? '');
            // Aralık tamamen temizlenince varsayılan döneme dönülür.
            if (!r.from && !r.to) setCustomPicked(false);
          }}
          presets={['month', 'lastMonth', '30d', 'year']}
        />
      )}

      {/* Hangi dönemin gösterildiği açıkça yazılsın. */}
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/40">
        {statement?.scope === 'since-settlement' && statement.lastSettledAt ? (
          <>
            Borç en son <b>{formatDate(statement.lastSettledAt.slice(0, 10))}</b> tarihinde
            kapanmış; o tarihten sonraki hareketler gösteriliyor.
          </>
        ) : statement?.scope === 'custom' ? (
          <>Seçilen tarih aralığındaki hareketler gösteriliyor.</>
        ) : (
          <>Tüm hareketler gösteriliyor.</>
        )}
        {statement?.hasEarlier
          ? ` Öncesinde ${statement.totalCount - statement.entries.length} hareket daha var (devir satırına bakın).`
          : ''}
      </p>
      {/* Dar ekranda tablo kendi içinde yana kayar; sayfa taşmaz. */}
      <div className="-mx-3 overflow-x-auto px-3">
        <table className="w-full min-w-[520px] text-xs sm:text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/40">
            <tr>
              <th className="px-2 py-2 font-medium">Tarih</th>
              <th className="px-2 py-2 font-medium">Açıklama</th>
              <th className="px-2 py-2 text-right font-medium">Borç</th>
              <th className="px-2 py-2 text-right font-medium">Ödeme/Alacak</th>
              <th className="px-2 py-2 text-right font-medium">Bakiye</th>
              {showUndo && <th className="px-2 py-2 text-right font-medium">İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {statementLoading && (
              <tr>
                <td colSpan={colCount} className="px-2 py-4 text-center text-slate-400">
                  <Spinner className="mr-2 align-middle" /> Ekstre yükleniyor…
                </td>
              </tr>
            )}
            {/* Dönem başı devri — ekstre kendi içinde tutarlı kalsın. */}
            {statement?.hasEarlier && (
              <tr className="border-t border-slate-100 bg-slate-50/60 dark:bg-slate-900/30">
                <td className="whitespace-nowrap px-2 py-2">
                  {statement.scope === 'since-settlement' && statement.lastSettledAt
                    ? formatDate(statement.lastSettledAt.slice(0, 10))
                    : ''}
                </td>
                <td className="px-2 py-2 italic text-slate-500">
                  Devir (önceki dönemden bakiye)
                </td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
                <td
                  className={`whitespace-nowrap px-2 py-2 text-right font-semibold ${balanceTone(
                    Number(statement.openingBalance),
                  )}`}
                >
                  {formatMoney(statement.openingBalance)}
                </td>
                {showUndo && <td className="px-2 py-2" />}
              </tr>
            )}
            {computed.map((e) => {
              const blocked = showUndo ? undoBlockReason(e, isOwner) : null;
              return (
                <tr
                  key={e.id}
                  className="border-t border-slate-100 align-top hover:bg-slate-50 dark:hover:bg-slate-900/30"
                >
                  <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                    {formatDate(e.occurredAt?.slice(0, 10))}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`badge mr-1 ${
                        SOURCE_BADGES[e.sourceType] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {SOURCE_LABELS[e.sourceType] ?? e.sourceType}
                    </span>
                    {e.description ? (
                      <span className="break-words text-slate-600">{e.description}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-medium text-red-600">
                    {e.entryType === 'debit' ? formatMoney(e.amount) : ''}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-medium text-emerald-700">
                    {e.entryType === 'credit' ? formatMoney(e.amount) : ''}
                  </td>
                  <td
                    className={`whitespace-nowrap px-2 py-2 text-right font-semibold ${balanceTone(
                      e.running,
                    )}`}
                  >
                    {formatMoney(e.running)}
                  </td>
                  {showUndo && (
                    <td className="px-2 py-1.5 text-right">
                      {blocked ? (
                        <span className="text-slate-300" title={blocked}>
                          —
                        </span>
                      ) : (
                        <button
                          className="btn-danger-soft btn-sm"
                          title="Yanlış girilen bu hareketi geri al (sil)"
                          disabled={undoMut.isPending}
                          onClick={() => undoEntry(e)}
                        >
                          {undoingId === e.id ? '…' : 'Geri al'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!statementLoading && !computed.length && (
              <tr>
                <td colSpan={colCount} className="px-2 py-4 text-center text-slate-400">
                  {statement?.scope === 'since-settlement' && statement.hasEarlier
                    ? 'Son borç kapatmadan bu yana hareket yok — borç kapalı.'
                    : 'Hareket yok.'}
                </td>
              </tr>
            )}
          </tbody>
          {computed.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 font-semibold">
              <tr>
                <td className="px-2 py-2 text-slate-500" colSpan={2}>
                  Dönem toplamı / son bakiye
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-red-600">
                  {formatMoney(periodDebit)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-emerald-700">
                  {formatMoney(periodCredit)}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-right ${balanceTone(
                    Number(ledgerBalance),
                  )}`}
                >
                  {formatMoney(ledgerBalance)}
                </td>
                {showUndo && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {undoMut.isError && (
        <p className="text-xs text-red-600">
          {(undoMut.error as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Hareket geri alınamadı.'}
        </p>
      )}

      {/* Geçmiş tarihli borç/ödeme ekle */}
      <div className="space-y-2 border-t border-slate-200 pt-3">
        <h4 className="text-sm font-semibold">Hareket ekle</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_8rem_auto_1fr_auto] sm:items-end">
          <label className="block min-w-0">
            <span className="label">Tür</span>
            <select
              className="input"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as 'debit' | 'credit')}
            >
              <option value="debit">Borç ekle</option>
              <option value="credit">Ödeme/alacak ekle</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="label">Tutar</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">Tarih</span>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">Açıklama</span>
            <input
              className="input"
              placeholder="örn. nakit / havale ABC Banka"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>
          <button
            className="btn-primary col-span-2 sm:col-span-1"
            disabled={!amount || Number(amount) <= 0 || addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            Ekle
          </button>
        </div>
      </div>

      {/* #5 Borcu kapat: tahsil edilen tutarı ve yöntemini gir; kalan fark
          "İndirim" olur. Hiç para almadan kapatmak için tutarı boş/0 bırakın. */}
      {currentBalance > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Borç kapatma
            </h4>
            <span className="text-sm text-slate-600">
              Güncel borç:{' '}
              <span className="font-bold text-red-600">{formatMoney(currentBalance)}</span>
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
            <div className="min-w-0">
              <label className="label" htmlFor={`settle-paid-${customerId}`}>
                Tahsil edilen (0 = para yok)
              </label>
              <div className="flex gap-2">
                <input
                  id={`settle-paid-${customerId}`}
                  className="input min-w-0"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="0,00"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
                <button
                  className="btn-secondary shrink-0"
                  title="Kalan borcun tamamını tahsilat olarak yaz (indirim yok)"
                  onClick={() => setPaid(String(currentBalance))}
                >
                  Tümü
                </button>
              </div>
            </div>
            <label className="block min-w-0">
              <span className="label">Tarih</span>
              <input
                className="input"
                type="date"
                value={settleDate}
                onChange={(e) => setSettleDate(e.target.value)}
              />
            </label>
            <div className="flex min-h-[44px] items-center text-sm text-slate-600">
              İndirim olarak yazılacak:&nbsp;
              <span className="font-bold text-amber-600">
                {formatMoney(discountAmount)}
              </span>
            </div>
          </div>

          {/* Para giriliyorsa ödeme yöntemi (ödeme formundaki gibi). */}
          {paidNum > 0 && (
            <div className="space-y-2">
              <div
                className="grid grid-cols-3 gap-2"
                role="group"
                aria-label="Ödeme yöntemi"
              >
                {METHOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={settleMethod === m.value}
                    className={`btn btn-sm border px-2 ${
                      settleMethod === m.value
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                    onClick={() => setSettleMethod(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {settleMethod === 'cash' && (
                <select
                  className="input"
                  value={settleReceivedById}
                  onChange={(e) => setSettleReceivedById(e.target.value)}
                  aria-label="Parayı alan çalışan"
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
                  className="input"
                  value={settleBankAccountId}
                  onChange={(e) => setSettleBankAccountId(e.target.value)}
                  aria-label="Banka hesabı"
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
                  className="input"
                  placeholder="İşletme / POS adı"
                  value={settleCardBusiness}
                  onChange={(e) => setSettleCardBusiness(e.target.value)}
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn bg-amber-600 text-white hover:bg-amber-700"
              disabled={!settleMethodReady || discountMut.isPending}
              onClick={async () => {
                if (
                  paidNum <= 0 &&
                  !(await confirmDialog({
                    message: `Hiç para alınmadan ${formatMoney(currentBalance)} borç kapatılacak (tamamı indirim). Devam edilsin mi?`,
                    confirmText: 'Borcu kapat',
                    danger: true,
                  }))
                ) {
                  return;
                }
                discountMut.mutate();
              }}
            >
              {paidNum > 0 ? 'Borcu kapat (tahsilatla)' : 'Borcu kapat (para almadan)'}
            </button>
            {paidNum <= 0 && (
              <span className="text-xs text-slate-500">
                Tutar 0 → gerçek ödeme oluşmaz, borç indirimle kapanır.
              </span>
            )}
            {paidNum > 0 && !settleMethodReady && (
              <span className="text-xs text-amber-700">
                {settleMethod === 'cash'
                  ? 'Parayı alan çalışanı seçin.'
                  : 'Banka hesabını seçin.'}
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
