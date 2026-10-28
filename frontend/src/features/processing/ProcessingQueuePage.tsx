import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  bulkUpdateProcessingJobs,
  deleteProcessingJob,
  fetchProcessingHistory,
  fetchQueue,
  setProcessingStatus,
  updateProcessingJob,
  type CompleteOptions,
} from '../../api/processing.api';
import { openPdf } from '../../api/documents.api';
import { fetchSales, fetchSalesSummary, type Sale } from '../../api/sales.api';
import { isPartialSheet, plateRemainingLabel } from '../../lib/plateLabel';
import {
  useListGrouping,
  useListDensity,
  GroupToggle,
  DensityToggle,
} from '../../context/DensityContext';
import { GroupSection } from '../../components/GroupSection';
import { CustomerPicker } from '../../components/CustomerPicker';
import { Pagination } from '../../components/Pagination';
import { Can } from '../../components/Can';
import { confirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { Filters } from '../../components/ui/Filters';
import { SearchInput } from '../../components/ui/SearchInput';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { formatDate, relativeDay } from '../../lib/format';
import { usePageSize } from '../../hooks/usePageSize';
import { useMaterialCategories } from '../../hooks/useReferenceData';
import { useDebounced } from '../../hooks/useDebounced';
import { mapLimit } from '../../lib/concurrency';
import { keepWhileSearching } from '../../lib/placeholder';
import { apiErrorMessage, toast } from '../../lib/toast';
import type { ProcessingJob, ProcessingStatus } from '../../types';

/** Kuyruk/geçmiş işini "Müşteri · Kategori" ile gruplar. */
function jobGroupKey(job: ProcessingJob): string {
  const customer = job.customer?.name ?? 'Müşterisiz';
  const category = job.plate?.template?.category?.name ?? 'Diğer';
  return `${customer} · ${category}`;
}

function groupJobs(jobs: ProcessingJob[]): [string, ProcessingJob[]][] {
  const map = new Map<string, ProcessingJob[]>();
  for (const j of jobs) {
    const k = jobGroupKey(j);
    const arr = map.get(k);
    if (arr) arr.push(j);
    else map.set(k, [j]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
}

/** Bir satış kaleminin ölçüsü: tabaka ise m², şerit/rulo ise metre, değilse adet. */
function saleItemMeasure(it: {
  widthMm?: number | null;
  heightMm?: number | null;
  quantity: number;
  billingUnit?: string | null;
  plate?: { measurementType?: string } | null;
}): string {
  const unit = it.plate?.measurementType ?? it.billingUnit;
  // Şerit/rulo (LENGTH): miktar metredir — "adet" değil.
  if (unit === 'length') {
    return `${Number(it.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} m`;
  }
  const w = Number(it.widthMm);
  const h = Number(it.heightMm);
  if (w && h) {
    const m2 = (w / 1000) * (h / 1000) * Number(it.quantity);
    return `${m2.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} m²`;
  }
  return `${it.quantity} adet`;
}

/** Tabakanın kalan ebadı: kesilmişse (parça) sarı rozetle vurgulanır. */
function RemainingTag({ plate }: { plate: ProcessingJob['plate'] }) {
  const label = plate && plateRemainingLabel(plate);
  if (!plate || !label) return null;
  return isPartialSheet(plate) ? (
    <span className="badge mt-1 bg-amber-100 font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
      ✂ {label}
    </span>
  ) : (
    <span className="mt-0.5 block text-xs text-slate-500">{label}</span>
  );
}

/** Kart içi etiketli alan (küçük form alanları için). */
function MiniField({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * #2 Malzeme satışları — üretim kuyruğu ekranında işleme işlerinin yanında
 * malzeme satışları da görünür. Son 30 gün; her satış için fiş (yazdır) düğmesi.
 */
function RecentSales() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ['sales', monthAgo, today],
    queryFn: () => fetchSales({ from: monthAgo, to: today, page: 1, limit: 100 }),
  });
  const sales: Sale[] = data?.items ?? [];
  // #D Son 30 günün adet/ciro/kârı sunucuda toplanır (listedeki en çok 100
  // satışla sınırlı kalmaz). İşletme payı = satış − sahip payı (kendi malında
  // tüm satış, konsinyede komisyon).
  const { data: summary } = useQuery({
    queryKey: ['sales', 'summary', monthAgo, today],
    queryFn: () => fetchSalesSummary({ from: monthAgo, to: today }),
  });
  const totalCount = summary?.count ?? sales.length;
  const totalProfit =
    summary?.businessMargin ?? sales.reduce((s, x) => s + Number(x.businessMargin || 0), 0);
  const totalSales = summary?.saleTotal ?? sales.reduce((s, x) => s + Number(x.saleTotal || 0), 0);
  // Katla/aç tercihi localStorage'da kalıcıdır → sayfa yenilense de korunur.
  // Katlıyken yalnızca adet, ciro ve kâr özeti görünür (kartlar gizlenir).
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('st_sales_collapsed') === '1',
  );
  const toggle = () =>
    setCollapsed((v) => {
      const n = !v;
      localStorage.setItem('st_sales_collapsed', n ? '1' : '0');
      return n;
    });
  return (
    <section className="space-y-2" aria-label="Malzeme satışları">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex min-h-[36px] items-center gap-1.5 text-base font-semibold text-slate-700 hover:text-slate-900"
          title={collapsed ? 'Satışları göster' : 'Satışları katla'}
        >
          <span className="text-xs text-slate-400">{collapsed ? '▸' : '▾'}</span>
          🧾 Malzeme satışları
          <span className="text-xs font-normal text-slate-500">(son 30 gün)</span>
        </button>
        {totalCount > 0 && (
          <span className="text-xs text-slate-500">
            {totalCount} satış · Ciro:{' '}
            <span className="font-semibold text-slate-800">{money.format(totalSales)}</span> · Kâr:{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {money.format(totalProfit)}
            </span>
          </span>
        )}
      </div>
      {!collapsed && isLoading && <LoadingBlock rows={2} label="Satışlar yükleniyor…" />}
      {!collapsed && totalCount > sales.length && sales.length > 0 && (
        <p className="text-xs text-slate-500">
          Son {sales.length} satış listeleniyor; toplamlar son 30 günün tamamını kapsar.
        </p>
      )}
      {!collapsed &&
        sales.map((s) => (
        <div key={s.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{s.buyerCustomer?.name ?? '—'}</p>
              <p className="text-xs text-slate-500">
                {formatDate(s.saleDate)} · {relativeDay(s.saleDate)}
              </p>
              {s.shopTransfer && (
                <Link
                  to={`/shop-transfers?q=${encodeURIComponent(s.shopTransfer.transferNo)}`}
                  className="badge mt-1 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-200"
                  title="Dükkânlar arası satış belgesi — malzemenin o dükkânda kime satıldığını gösterir"
                >
                  🔁 {s.shopTransfer.toShopName} dükkânına · {s.shopTransfer.transferNo}
                </Link>
              )}
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="text-right">
                <span className="block font-bold">
                  {money.format(Number(s.saleTotal))}
                </span>
                <span className="block text-xs text-emerald-700 dark:text-emerald-400">
                  kâr {money.format(Number(s.businessMargin || 0))}
                </span>
              </div>
              <button
                className="btn-secondary btn-sm"
                title="Satış fişini yazdır"
                onClick={() => openPdf(`/sales/${s.id}/print`)}
              >
                Fiş
              </button>
            </div>
          </div>
          <ul className="space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-600">
            {s.items.map((it, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {it.plate?.name ?? it.itemName ?? '—'} · {saleItemMeasure(it)} ×{' '}
                  {money.format(Number(it.unitPrice))}
                  {it.origin && (
                    <span
                      className="ml-1 whitespace-nowrap text-sky-700 dark:text-sky-300"
                      title={`${it.origin.transferNo} belgesiyle alındı`}
                    >
                      · 🏬 {it.origin.fromShopName} dükkânından alınan
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right font-medium">
                  {money.format(Number(it.lineTotal))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        ))}
      {!collapsed && !isLoading && !sales.length && (
        <EmptyState compact icon="🧾" title="Son 30 günde malzeme satışı yok." />
      )}
    </section>
  );
}

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

const STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  in_progress: 'İşleniyor',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

/** Durum rozeti renkleri (kuyruk ve geçmiş kartlarında aynı). */
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_BADGE[status] ?? 'bg-slate-200 text-slate-700'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** #8a Geçmiş üretim işleri — tarih aralığı + durum ile sorgulanır. */
function ProcessingHistory() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<'' | ProcessingStatus>('completed');
  // Geçmişte ürün bulmayı kolaylaştıran süzgeçler: tür (kategori), sahip
  // (müşteri) ve serbest arama. filterKey → CustomerPicker'ı sıfırlamak için.
  const [categoryId, setCategoryId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [filterKey, setFilterKey] = useState(0);
  // Sayfalama: sayfa başına kayıt kalıcı; filtre değişince sayfa 1'e döner.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('queue-history', 20);
  useEffect(() => {
    setPage(1);
  }, [from, to, status, categoryId, customerId, search, pageSize]);
  const changePageSize = (n: number) => {
    setPageSize(n);
    setPage(1);
  };
  // Toplu düzenleme için seçilen işler. Süzgeç değişince seçim sıfırlanır
  // (görünmeyen bir işe yanlışlıkla toplu işlem uygulanmasın); sayfa
  // değişince korunur (birkaç sayfadan seçilebilsin).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [from, to, status, categoryId, customerId, search]);
  const toggleJob = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) (on ? n.add(id) : n.delete(id));
      return n;
    });

  // Varsayılandan (son 30 gün · tamamlananlar) farklı olan süzgeçler sayılır;
  // "Filtreleri temizle" hepsini varsayılana döndürür.
  const activeCount =
    (from !== monthAgo || to !== today ? 1 : 0) +
    (status !== 'completed' ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (customerId ? 1 : 0);
  const clearFilters = () => {
    setFrom(monthAgo);
    setTo(today);
    setStatus('completed');
    setCategoryId('');
    setCustomerId('');
    setSearch('');
    setFilterKey((k) => k + 1);
  };

  const { data: categories } = useMaterialCategories();
  const { grouped, toggle: toggleGroup } = useListGrouping();
  // Arama yazma bitince (~300 ms) uygulanır; yeni sonuç gelene kadar önceki
  // liste kalır (iskelete dönüp titremez).
  const searchTerm = useDebounced(search.trim());
  const { data, isLoading } = useQuery({
    queryKey: [
      'processing-history',
      from,
      to,
      status,
      categoryId,
      customerId,
      searchTerm,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchProcessingHistory({
        from,
        to,
        status: status || undefined,
        categoryId: categoryId || undefined,
        customerId: customerId || undefined,
        search: searchTerm || undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-2" aria-label="Geçmiş işler">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-700">📜 Geçmiş işler</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Can module="processing" level="write">
            {!!data?.items.length && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const ids = data.items.map((j) => j.id);
                  setMany(ids, !ids.every((id) => selected.has(id)));
                }}
              >
                {data.items.every((j) => selected.has(j.id))
                  ? 'Seçimi kaldır'
                  : `Görünenlerin tümünü seç (${data.items.length})`}
              </button>
            )}
          </Can>
          <GroupToggle grouped={grouped} onToggle={toggleGroup} />
        </div>
      </div>
      <Filters
        className="!mb-2"
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Ara (plaka adı / müşteri)…"
            aria-label="Geçmiş işlerde ara"
          />
        }
        activeCount={activeCount}
        onClear={clearFilters}
      >
        <DateRangeFilter
          value={{ from: from || undefined, to: to || undefined }}
          onChange={(r) => {
            setFrom(r.from ?? '');
            setTo(r.to ?? '');
          }}
          hint="Tüm tarihler"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="block min-w-0">
            <span className="label">Durum</span>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | ProcessingStatus)}
            >
              <option value="">Tümü</option>
              <option value="completed">Tamamlandı</option>
              <option value="cancelled">İptal</option>
              <option value="pending">Bekliyor</option>
              <option value="in_progress">İşleniyor</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="label">Malzeme türü</span>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Tüm malzeme türleri</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-0">
            <span className="label">Sahip (müşteri)</span>
            <CustomerPicker
              key={filterKey}
              placeholder="Sahibe göre süz (müşteri ara)…"
              onChange={(id) => setCustomerId(id)}
            />
          </div>
        </div>
      </Filters>
      {isLoading ? (
        <LoadingBlock rows={2} label="Geçmiş işler yükleniyor…" />
      ) : grouped ? (
        groupJobs(data?.items ?? []).map(([key, jobs]) => {
          const allOn = jobs.every((j) => selected.has(j.id));
          return (
            <GroupSection
              key={key}
              title={key}
              count={jobs.length}
              countLabel="iş"
              actions={
                <Can module="processing" level="write">
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-700 underline dark:text-blue-300"
                    onClick={() =>
                      setMany(
                        jobs.map((j) => j.id),
                        !allOn,
                      )
                    }
                  >
                    {allOn ? 'Grup seçimini kaldır' : 'Grubu seç'}
                  </button>
                </Can>
              }
            >
              {jobs.map((job) => (
                <HistoryJobCard
                  key={job.id}
                  job={job}
                  selected={selected.has(job.id)}
                  onToggle={() => toggleJob(job.id)}
                />
              ))}
            </GroupSection>
          );
        })
      ) : (
        data?.items.map((job) => (
          <HistoryJobCard
            key={job.id}
            job={job}
            selected={selected.has(job.id)}
            onToggle={() => toggleJob(job.id)}
          />
        ))
      )}
      {!isLoading && !data?.items.length && (
        <EmptyState
          compact
          icon="📜"
          title="Bu aralıkta iş yok."
          hint="Tarih aralığını genişletin ya da durum filtresini “Tümü” yapın."
          action={
            activeCount > 0 || search ? (
              <button className="btn-secondary btn-sm" onClick={clearFilters}>
                Filtreleri temizle
              </button>
            ) : undefined
          }
        />
      )}
      {data?.meta && (
        <Pagination
          page={data.meta.page}
          pageCount={data.meta.pageCount}
          total={data.meta.total}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={changePageSize}
        />
      )}
      {selected.size > 0 && (
        <BulkEditBar ids={[...selected]} onClear={() => setSelected(new Set())} />
      )}
    </section>
  );
}

/**
 * Seçilen geçmiş işlere toplu tarih/not uygulayan alt çubuk. Boş bırakılan
 * alan dokunulmaz; "aynı gün" tamamlanmayı işlenme gününe eşitler.
 */
function BulkEditBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const qc = useQueryClient();
  const [processedAt, setProcessedAt] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [sameDay, setSameDay] = useState(false);
  const [note, setNote] = useState('');
  const [noteOn, setNoteOn] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);

  const nothing = !processedAt && !completedAt && !sameDay && !noteOn;
  const mut = useMutation({
    mutationFn: () =>
      bulkUpdateProcessingJobs({
        ids,
        processedAt: processedAt || undefined,
        completedAt: sameDay ? undefined : completedAt || undefined,
        sameDay: sameDay || undefined,
        note: noteOn ? note : undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['processing-history'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      if (res.failed.length) {
        toast.warning(
          `${res.updated} iş güncellendi, ${res.failed.length} iş güncellenemedi`,
          res.failed[0]?.reason,
        );
      } else {
        toast.success(`${res.updated} işin tarihi güncellendi`);
        onClear();
      }
    },
    onError: (e) => toast.error('Toplu düzenleme yapılamadı', apiErrorMessage(e)),
  });

  const quick = (label: string, set: () => void) => (
    <button type="button" className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300" onClick={set}>
      {label}
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Toplu düzenleme"
      className="sticky bottom-20 z-20 md:bottom-2 space-y-2 rounded-2xl border border-blue-300 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-blue-800 dark:bg-slate-900/95"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
          ✎ {ids.length} iş seçili — toplu düzenle
        </p>
        <button type="button" className="ml-auto text-xs underline text-slate-500" onClick={onClear}>
          Seçimi temizle
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[11rem_11rem_auto_minmax(0,1fr)_auto] lg:items-end">
        <MiniField label="İşlenme tarihi">
          <input
            className="input"
            type="date"
            max={todayStr}
            value={processedAt}
            onChange={(e) => setProcessedAt(e.target.value)}
          />
        </MiniField>
        <MiniField label="Tamamlanma tarihi">
          <input
            className="input"
            type="date"
            max={todayStr}
            disabled={sameDay}
            value={sameDay ? '' : completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
          />
        </MiniField>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} />
          Aynı gün tamamlandı
        </label>
        <MiniField label="Not (boş bırakırsanız not silinir)">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label="Notu değiştir"
              checked={noteOn}
              onChange={(e) => setNoteOn(e.target.checked)}
            />
            <input
              className="input"
              placeholder="Notu değiştir…"
              disabled={!noteOn}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </MiniField>
        <button
          type="button"
          className="btn-primary"
          disabled={nothing || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending && <Spinner />}
          Seçilenlere uygula
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
        Hızlı:
        {quick('İşlenme = bugün', () => setProcessedAt(todayStr))}
        {quick('İşlenme = dün', () => setProcessedAt(new Date(Date.now() - 864e5).toISOString().slice(0, 10)))}
        {quick('Tamamlanma = işlenme günü', () => setSameDay(true))}
      </div>
    </div>
  );
}

/**
 * Geçmiş iş kartı — tamamlandıktan sonra da düzenlenebilir: işlenme ve
 * TAMAMLANMA tarihi ile not. (Tutar/stok değişmez.)
 */
function HistoryJobCard({
  job,
  selected = false,
  onToggle,
}: {
  job: ProcessingJob;
  selected?: boolean;
  /** Verilirse karta toplu seçim kutusu eklenir. */
  onToggle?: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [processedAt, setProcessedAt] = useState(job.processedAt?.slice(0, 10) ?? '');
  const [completedAt, setCompletedAt] = useState(job.completedAt?.slice(0, 10) ?? '');
  const [note, setNote] = useState(job.note ?? '');

  const mut = useMutation({
    mutationFn: () =>
      updateProcessingJob(job.id, {
        processedAt: processedAt || undefined,
        completedAt: completedAt || undefined,
        note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing-history'] });
      // Tarih/not değişimi ekstreye yansır → cari listesi tazelensin.
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditing(false);
    },
  });

  const del = useMutation({
    mutationFn: () => deleteProcessingJob(job.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing-history'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      // Silme stoğu iade eder + borcu ekstreden düşer.
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
    },
  });

  async function handleDelete() {
    const ok = await confirmDialog({
      title: 'İş silinsin mi?',
      message:
        `${job.plate?.name ?? 'Bu iş'} silinecek. Tüketilen stok iade edilir ve borç cari ekstreden düşülür.`,
      confirmText: 'Sil',
      danger: true,
    });
    if (ok) del.mutate();
  }

  return (
    <div className={`card space-y-2 ${selected ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        {onToggle && (
          <Can module="processing" level="write">
            <label
              className="-m-2 flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center"
              title="Toplu düzenleme için seç"
            >
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={selected}
                onChange={onToggle}
                aria-label={`${job.plate?.name ?? 'İş'} seç`}
              />
            </label>
          </Can>
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{job.plate?.name ?? '—'}</p>
          <p className="truncate text-sm text-slate-600">
            {job.customer?.name ?? 'Müşterisiz'} · {jobMeasure(job)}
          </p>
          <p className="text-xs text-slate-500">
            İşlenme: {formatDate(job.processedAt)}
            {job.completedAt && ` · Tamamlanma: ${formatDate(job.completedAt)}`}
          </p>
          {job.note && !editing && (
            <p className="mt-0.5 line-clamp-2 text-xs italic text-slate-500">“{job.note}”</p>
          )}
          <RemainingTag plate={job.plate} />
        </div>
        <div className="shrink-0 text-right">
          <StatusBadge status={job.status} />
          <p className="mt-1 text-lg font-bold">{money.format(Number(job.totalCost))}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          className={editing ? 'btn-ghost btn-sm' : 'btn-secondary btn-sm'}
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Kapat' : 'Düzenle'}
        </button>
        <button
          className="btn-danger-soft btn-sm"
          disabled={del.isPending}
          onClick={handleDelete}
        >
          Sil
        </button>
      </div>
      {del.isError && (
        <p className="text-xs text-red-600">Silinemedi. Tekrar deneyin.</p>
      )}

      {editing && (
        <div className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-[12rem_12rem_minmax(0,1fr)_auto] lg:items-end">
          <MiniField label="İşlenme tarihi">
            <input
              className="input"
              type="date"
              value={processedAt}
              onChange={(e) => setProcessedAt(e.target.value)}
            />
          </MiniField>
          <MiniField label="Tamamlanma tarihi">
            <input
              className="input"
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
            />
          </MiniField>
          <MiniField label="Not" className="sm:col-span-2 lg:col-span-1">
            <input
              className="input"
              placeholder="Not"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </MiniField>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button
              className="btn-secondary flex-1 lg:flex-none"
              onClick={() => setEditing(false)}
            >
              Vazgeç
            </button>
            <button
              className="btn-primary flex-1 lg:flex-none"
              disabled={mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending && <Spinner />}
              Kaydet
            </button>
          </div>
          {mut.isError && (
            <p className="text-xs text-red-600 sm:col-span-2 lg:col-span-4">Kaydedilemedi.</p>
          )}
        </div>
      )}
    </div>
  );
}

const unitLabel: Record<string, string> = {
  area: 'm²',
  length: 'm',
  piece: 'adet',
  weight: 'kg',
  time: 'saat',
};

/** İşin ölçüsü: süreyle işte dakika ("30 dk"), diğerlerinde miktar + birim. */
function jobMeasure(job: ProcessingJob): string {
  if (job.billingUnit === 'time' && job.durationMinutes != null) {
    return `${Number(job.durationMinutes).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} dk`;
  }
  return `${job.quantityValue} ${unitLabel[job.billingUnit] ?? ''}`;
}

/**
 * Üretim Kuyruğu — bekleyen/işlenen işler makineye göre gruplu. Çalışan işi
 * "Başlat" / "Tamamla" / "İptal" ile ilerletir; tamamlamada stok düşer ve
 * (ertelenmişse) cariye borç yazılır.
 */
export function ProcessingQueuePage() {
  const qc = useQueryClient();
  const { grouped, toggle: toggleGroup } = useListGrouping();
  const { mini: miniView, toggle: toggleMini } = useListDensity();
  // #4 Kuyruk filtreleri: malzeme türü (kategori), sahip (müşteri), arama.
  const [categoryId, setCategoryId] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [filterKey, setFilterKey] = useState(0); // CustomerPicker'ı sıfırlamak için
  const { data: categories } = useMaterialCategories();
  // Arama yazma bitince (~300 ms) uygulanır; önceki liste yeni sonuca kadar kalır.
  const searchTerm = useDebounced(search.trim());
  const queueKey = ['queue', categoryId, filterCustomerId, searchTerm];
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: queueKey,
    queryFn: () =>
      fetchQueue({
        categoryId: categoryId || undefined,
        customerId: filterCustomerId || undefined,
        search: searchTerm || undefined,
      }),
    // Yalnız arama yazılırken önceki liste kalır; tür/sahip süzgeci değişince
    // eski süzgecin işleri gösterilmez ("Tümünü tamamla" onlara uygulanmasın).
    placeholderData: keepWhileSearching(queueKey),
  });

  const mut = useMutation({
    mutationFn: ({
      id,
      status,
      opts,
    }: {
      id: string;
      status: ProcessingStatus;
      opts?: CompleteOptions;
    }) => setProcessingStatus(id, status, opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      // İptalde tabaka kalan ebadı, tamamlamada stok değişir → stok listesi tazelensin.
      qc.invalidateQueries({ queryKey: ['plates'] });
      // Tamamlanan/iptal edilen iş geçmiş listesine düşsün (#3).
      qc.invalidateQueries({ queryKey: ['processing-history'] });
    },
  });

  // #1 "Tümünü Tamamla": kuyrukta görünen (filtrelenmiş) tüm işleri COMPLETED
  // yapar (stok düşer + faturalanır). Kalan parça/nihai fiyat sorulmaz. Farklı
  // plakaların işleri 4'er 4'er gönderilir; aynı plakanın işleri sırayla (stok
  // düşümü çakışmasın). Biri başarısız olsa da diğerleri tamamlanır ve sonuç
  // ne olursa olsun listeler tazelenir.
  const bulkComplete = useMutation({
    mutationFn: async (jobs: { id: string; plateId: string }[]) => {
      const byPlate = new Map<string, string[]>();
      for (const j of jobs) {
        const ids = byPlate.get(j.plateId);
        if (ids) ids.push(j.id);
        else byPlate.set(j.plateId, [j.id]);
      }
      const results = await mapLimit([...byPlate.values()], 4, async (ids) => {
        for (const id of ids) await setProcessingStatus(id, 'completed');
      });
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['processing-history'] });
    },
  });

  // Yükleniyorken sayfa (başlık + filtreler) yerinde kalır; yalnız liste
  // iskelete döner → arama kutusu yazarken kaybolmaz.
  const groups = data ?? [];
  const empty = groups.every((g) => g.jobs.length === 0);
  const allJobs = groups.flatMap((g) => g.jobs);
  const filterCount = (categoryId ? 1 : 0) + (filterCustomerId ? 1 : 0);
  const filtered = filterCount > 0 || !!search;
  const clearFilters = () => {
    setCategoryId('');
    setFilterCustomerId('');
    setSearch('');
    setFilterKey((k) => k + 1);
  };

  const completeAll = async () => {
    const ok = await confirmDialog({
      title: 'Tümü tamamlansın mı?',
      message: `Kuyrukta görünen ${allJobs.length} işin tümü tamamlanacak (stok düşer, faturalanır). Onaylıyor musunuz?`,
      confirmText: 'Tümünü tamamla',
      danger: false,
    });
    if (ok) bulkComplete.mutate(allJobs.map((j) => ({ id: j.id, plateId: j.plateId })));
  };

  const renderCard = (job: ProcessingJob) => (
    <QueueJobCard
      key={job.id}
      job={job}
      pending={mut.isPending}
      mini={miniView}
      onAction={(status, opts) => mut.mutate({ id: job.id, status, opts })}
    />
  );
  // Mini modda işler sıkışık, çizgiyle ayrılmış bir liste olarak; detaylı modda
  // (varsayılan) her iş ayrı kart olarak gösterilir.
  const renderJobs = (jobs: ProcessingJob[]) =>
    miniView ? (
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700">
        {jobs.map(renderCard)}
      </div>
    ) : (
      <>{jobs.map(renderCard)}</>
    );

  const pendingCount = allJobs.filter((j) => j.status === 'pending').length;
  const runningCount = allJobs.length - pendingCount;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Üretim Kuyruğu"
        icon="🛠️"
        subtitle={
          allJobs.length
            ? `${pendingCount} bekliyor · ${runningCount} işleniyor — tamamlanınca stok düşer ve cariye yansır.`
            : 'Bekleyen ve işlenen işler; tamamlanınca stok düşer ve cariye yansır.'
        }
        actions={
          <>
            {allJobs.length > 0 && (
              <button
                className="btn-success"
                disabled={bulkComplete.isPending || mut.isPending || isPlaceholderData}
                onClick={completeAll}
              >
                {bulkComplete.isPending && <Spinner />}
                {bulkComplete.isPending ? 'Tamamlanıyor…' : `✓ Tümünü Tamamla (${allJobs.length})`}
              </button>
            )}
            <DensityToggle mini={miniView} onToggle={toggleMini} />
            <GroupToggle grouped={grouped} onToggle={toggleGroup} />
          </>
        }
      />

      {/* #4 Tür / sahip / arama filtreleri */}
      <Filters
        className="!mb-0"
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Ara (plaka adı / müşteri)…"
            aria-label="Kuyrukta ara"
          />
        }
        activeCount={filterCount}
        onClear={clearFilters}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="label">Malzeme türü</span>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Tüm malzeme türleri</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-0">
            <span className="label">Sahip (müşteri)</span>
            <CustomerPicker
              key={filterKey}
              placeholder="Sahibe göre süz (müşteri ara)…"
              onChange={(id) => setFilterCustomerId(id)}
            />
          </div>
        </div>
      </Filters>

      {mut.isError && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {(mut.error as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ?? 'İşlem güncellenemedi.'}
        </p>
      )}

      {isLoading ? (
        <LoadingBlock rows={3} label="Kuyruk yükleniyor…" />
      ) : empty ? (
        filtered ? (
          <EmptyState
            icon="🔍"
            title="Filtreye uyan iş yok"
            hint="Aramayı ya da süzgeçleri değiştirin; kuyruktaki tüm işleri görmek için filtreleri temizleyin."
            action={
              <button className="btn-secondary" onClick={clearFilters}>
                Filtreleri temizle
              </button>
            }
          />
        ) : (
          <EmptyState
            icon="✅"
            title="Kuyrukta bekleyen iş yok."
            hint="Kabul edilen bir teklifi “Satış/İşlemeye Dönüştür” ile kuyruğa ekleyebilirsiniz."
            action={
              <Can module="quotes">
                <Link to="/quotes" className="btn-secondary">
                  📝 Tekliflere git
                </Link>
              </Can>
            }
          />
        )
      ) : grouped ? (
        /* Gruplu: Müşteri · Kategori; grupsuz: makineye göre (varsayılan). */
        groupJobs(allJobs).map(([key, jobs]) => (
          <GroupSection key={key} title={key} count={jobs.length} countLabel="iş">
            {renderJobs(jobs)}
          </GroupSection>
        ))
      ) : (
        groups.map((group) => (
          <GroupSection
            key={group.machineId ?? 'unassigned'}
            title={`🛠️ ${group.machineName}`}
            count={group.jobs.length}
            countLabel="iş"
          >
            {renderJobs(group.jobs)}
          </GroupSection>
        ))
      )}

      <RecentSales />

      <ProcessingHistory />
    </div>
  );
}

/**
 * Kuyruktaki tek iş kartı. "Tamamla"da iş bitiminde müşteriyle pazarlık edilen
 * NİHAİ fiyat girilebilir; girilirse faturalama o tutar üzerinden yapılır ve işin
 * güncel ücreti olarak görünür. Boş bırakılırsa hesaplanan ücret kullanılır.
 */
function QueueJobCard({
  job,
  pending,
  mini = false,
  onAction,
}: {
  job: ProcessingJob;
  pending: boolean;
  mini?: boolean;
  onAction: (status: ProcessingStatus, opts?: CompleteOptions) => void;
}) {
  const [finalPrice, setFinalPrice] = useState('');
  // Fire/kalan parça (ops.): kesimden artan parçanın ebadı — tamamlanınca
  // aynı türden kesik plaka olarak stoğa eklenir (sahiplik korunur).
  const [offW, setOffW] = useState('');
  const [offH, setOffH] = useState('');
  // #2 "Tamamla" öncesi işlenme/tamamlanma tarihleri (ops.; boş = korunur/şimdi).
  const [processedAt, setProcessedAt] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  // Telefonda isteğe bağlı tamamlama alanları katlı durur (masaüstünde hep açık).
  const [optsOpen, setOptsOpen] = useState(false);
  const isAreaPlate = !job.plate?.measurementType || job.plate.measurementType === 'area';
  // Doldurulmuş isteğe bağlı alan sayısı: katlıyken de unutulmasın diye gösterilir.
  const filledOpts = [finalPrice, offW || offH, processedAt, completedAt].filter(Boolean).length;

  // Tamamlama: girilen nihai fiyat, fire ebadı ve (ops.) tarihlerle birlikte.
  const complete = () =>
    onAction('completed', {
      finalAmount: finalPrice !== '' ? Number(finalPrice) : undefined,
      offcutWidthMm: offW !== '' ? Number(offW) : undefined,
      offcutHeightMm: offH !== '' ? Number(offH) : undefined,
      processedAt: processedAt || undefined,
      completedAt: completedAt || undefined,
    });

  // İptal geri alınamaz: kısa bir onay iste.
  const cancel = async () => {
    const ok = await confirmDialog({
      title: 'İş iptal edilsin mi?',
      message: `${job.plate?.name ?? 'Bu iş'} (${job.customer?.name ?? 'Müşterisiz'}) kuyruktan iptal edilecek.`,
      confirmText: 'İptal et',
      cancelText: 'Vazgeç',
      danger: true,
    });
    if (ok) onAction('cancelled');
  };

  // Mini mod: tek satır — ad/müşteri + tutar + aksiyonlar (ops. alanlar gizli).
  if (mini) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                job.status === 'in_progress' ? 'bg-blue-500' : 'bg-amber-400'
              }`}
              title={STATUS_LABELS[job.status]}
              aria-hidden
            />
            <span className="truncate">{job.plate?.name ?? '—'}</span>
            <span className="sr-only">({STATUS_LABELS[job.status]})</span>
          </p>
          <p className="truncate text-xs text-slate-500">
            {job.customer?.name ?? 'Müşterisiz'} · {jobMeasure(job)} · {formatDate(job.processedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="mr-1 text-sm font-bold">
            {money.format(job.totalCost)}
          </span>
          {job.status === 'pending' && (
            <button
              className="btn-primary btn-sm"
              disabled={pending}
              onClick={() => onAction('in_progress')}
            >
              Başlat
            </button>
          )}
          <button
            className="btn-success btn-sm"
            disabled={pending}
            onClick={complete}
          >
            Tamamla
          </button>
          <button
            className="btn-danger-soft btn-sm"
            disabled={pending}
            onClick={cancel}
          >
            İptal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold">{job.plate?.name ?? '—'}</p>
          <p className="truncate text-sm text-slate-600">
            {job.customer?.name ?? 'Müşterisiz'} · {jobMeasure(job)}
          </p>
          <p className="text-xs text-slate-500">
            İşlenme: {formatDate(job.processedAt)} · {relativeDay(job.processedAt)}
          </p>
          {job.note && (
            <p className="mt-0.5 line-clamp-2 text-xs italic text-slate-500">“{job.note}”</p>
          )}
          <RemainingTag plate={job.plate} />
        </div>
        <div className="shrink-0 text-right">
          <StatusBadge status={job.status} />
          <p className="mt-1 text-lg font-bold">{money.format(job.totalCost)}</p>
        </div>
      </div>

      {/* İsteğe bağlı tamamlama alanları — telefonda katlı, masaüstünde açık. */}
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600 md:hidden"
        aria-expanded={optsOpen}
        onClick={() => setOptsOpen((v) => !v)}
      >
        <span>
          Tamamlama seçenekleri (ops.)
          {filledOpts > 0 && (
            <span className="ml-2 rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
              {filledOpts}
            </span>
          )}
        </span>
        <span>{optsOpen ? '▲' : '▼'}</span>
      </button>
      <div
        className={`${optsOpen ? 'grid' : 'hidden'} grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 md:grid lg:grid-cols-4 dark:bg-slate-900/40`}
      >
        {/* İş bitimi pazarlık fiyatı (opsiyonel) */}
        <MiniField label="Nihai fiyat (ops.)" hint="Boş = hesaplanan ücret">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={money.format(job.totalCost)}
            value={finalPrice}
            onChange={(e) => setFinalPrice(e.target.value)}
          />
        </MiniField>

        {/* ✂ Fire/kalan parça (ops.) — yalnızca tabaka (AREA) işlerinde. */}
        {isAreaPlate && (
          <MiniField
            label="✂ Kalan parçayı stoğa ekle (ops.)"
            hint="Tamamlanınca kesik plaka olarak stoğa girer (sahiplik korunur)"
          >
            <span className="flex items-center gap-1.5">
              <input
                className="input min-w-0"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="En (mm)"
                aria-label="Kalan parça eni (mm)"
                value={offW}
                onChange={(e) => setOffW(e.target.value)}
              />
              <span className="text-xs text-slate-400">×</span>
              <input
                className="input min-w-0"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Boy (mm)"
                aria-label="Kalan parça boyu (mm)"
                value={offH}
                onChange={(e) => setOffH(e.target.value)}
              />
            </span>
          </MiniField>
        )}

        {/* #2 Tamamla öncesi tarihler (ops.) — boş bırakılırsa işlenme tarihi
            korunur, tamamlanma "şimdi" olur. */}
        <MiniField label="İşlenme tarihi (ops.)" hint="Boş = korunur">
          <input
            className="input"
            type="date"
            value={processedAt}
            onChange={(e) => setProcessedAt(e.target.value)}
          />
        </MiniField>
        <MiniField label="Tamamlanma tarihi (ops.)" hint="Boş = şimdi">
          <input
            className="input"
            type="date"
            value={completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
          />
        </MiniField>
      </div>

      {/* Eylemler: sıradaki adım dolgulu; yazdırma ikincil; İptal en sonda. */}
      <div className="flex flex-wrap items-center gap-2">
        {job.status === 'pending' && (
          <button
            className="btn-primary btn-sm"
            disabled={pending}
            onClick={() => onAction('in_progress')}
          >
            Başlat
          </button>
        )}
        <button
          className="btn-success btn-sm"
          disabled={pending}
          onClick={complete}
        >
          Tamamla
        </button>
        <button
          className="btn-secondary btn-sm"
          title="İş fişini yazdır"
          onClick={() => openPdf(`/processing/${job.id}/print`)}
        >
          Fiş
        </button>
        {job.quoteId && (
          <button
            className="btn-secondary btn-sm"
            title="Bu işin kaynak teklifini aç"
            onClick={() => openPdf(`/quotes/${job.quoteId}/print`)}
          >
            Teklif
          </button>
        )}
        <button
          className="btn-danger-soft btn-sm ml-auto"
          disabled={pending}
          onClick={cancel}
        >
          İptal
        </button>
      </div>
    </div>
  );
}
