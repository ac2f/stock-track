import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  convertQuote,
  createQuote,
  deleteQuote,
  fetchQuotes,
  setQuoteStatus,
  type CreateQuoteInput,
  type QuoteFilters,
} from '../../api/quotes.api';
import { fetchCustomers } from '../../api/customers.api';
import {
  comparePrices,
  fetchMaterialCategories,
  fetchMaterialTemplates,
  fetchPlates,
} from '../../api/materials.api';
import { downloadFile, openPdf } from '../../api/documents.api';
import { fetchQueue } from '../../api/processing.api';
import { isPartialSheet, plateRemainingLabel } from '../../lib/plateLabel';
import { SearchSelect } from '../../components/SearchSelect';
import { quoteLinePreview, UNIT_LABEL } from '../../lib/quoteCalc';
import { CustomerPicker } from '../../components/CustomerPicker';
import { useListDensity, DensityToggle } from '../../context/DensityContext';
import { updateQuote } from '../../api/quotes.api';
import type {
  MeasurementType,
  Plate,
  Quote,
  QuoteItemInput,
  QuoteStatus,
} from '../../types';

/**
 * Form içi kalem: backend QuoteItemInput + UI-içi sahip (konsinye) seçimi.
 * ownerMode yalnızca arayüz filtresi: 'auto' (satışta tümü, işlemede alıcının
 * malzemeleri) · 'business' (işletme stoğu) · 'customer' (aranan müşteri).
 */
type FormItem = QuoteItemInput & {
  ownerCustomerId?: string;
  ownerMode?: 'auto' | 'business' | 'customer';
};

/**
 * Plaka seçici (gerekirse sahibe göre filtreli). Sahip verilirse yalnızca o
 * müşterinin malzemeleri listelenir (#1). Seçilen plaka nesnesi yukarı bildirilir.
 */
/** Bir plakanın sahip etiketi: konsinye ise müşteri adları, değilse "İşletme". */
function plateOwnerLabel(p: Plate): string {
  return p.owners?.length ? p.owners.join(', ') : 'İşletme';
}

/** Seçici alt satırı: kategori + (tabaka ise kalan ebat / şerit ise yükseklik×uzunluk). */
function platePickSublabel(p: Plate): string {
  const cat = p.template?.category?.name;
  const parts: string[] = [];
  if (cat) parts.push(cat);
  if (p.measurementType === 'length') {
    const h = Number(p.heightMm);
    parts.push(`${h ? `${h}mm × ` : ''}${Number(p.quantityInStock)} m`);
  } else {
    const rem = plateRemainingLabel(p);
    if (rem) parts.push(rem);
  }
  return parts.join(' · ');
}

function PlatePicker({
  ownerCustomerId,
  businessOnly,
  excludeOwnerCustomerId,
  preferOwnerName,
  value,
  onPick,
  highlightIds,
  selectedPlate,
}: {
  ownerCustomerId?: string;
  /** Yalnızca işletmeye ait stok listelensin (owner=business filtresi). */
  businessOnly?: boolean;
  excludeOwnerCustomerId?: string;
  /** Bu sahibin (alıcının) malzemeleri listede EN ÜSTTE gruplansın. */
  preferOwnerName?: string;
  value: string;
  onPick: (plateId: string, plate?: Plate) => void;
  /** #7 Zaten başka bir kaleme eklenmiş plakalar ayrı renkte gösterilir. */
  highlightIds?: Set<string>;
  /** #8 Düzenlemede seçili plaka listede olmasa da adı görünsün. */
  selectedPlate?: Plate;
}) {
  // Ürün türü (kategori) filtresi — varsayılan: tümü.
  const [categoryId, setCategoryId] = useState('');
  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });
  const { data } = useQuery({
    queryKey: [
      'plates',
      'pick',
      businessOnly ? 'business' : ownerCustomerId ?? 'all',
      excludeOwnerCustomerId ?? '',
      categoryId,
    ],
    queryFn: () =>
      fetchPlates({
        ownerCustomerId: businessOnly ? undefined : ownerCustomerId || undefined,
        owner: businessOnly ? 'business' : undefined,
        excludeOwnerCustomerId: excludeOwnerCustomerId || undefined,
        categoryId: categoryId || undefined,
        page: 1,
        limit: 100,
      }),
  });
  const items = data?.items ?? [];
  // Seçili plaka listede yoksa (ör. düzenlemede farklı filtre) başa eklenir.
  const merged =
    selectedPlate && !items.some((p) => p.id === selectedPlate.id)
      ? [selectedPlate, ...items]
      : items;
  // Sahiplere göre sırala: tercih edilen sahip (alıcı) → İşletme → diğerleri (ada göre).
  const ownerRank = (p: Plate): [number, string] => {
    const label = plateOwnerLabel(p);
    if (preferOwnerName && p.owners?.includes(preferOwnerName)) return [0, label];
    if (label === 'İşletme') return [1, label];
    return [2, label];
  };
  const sorted = [...merged].sort((a, b) => {
    const [ra, la] = ownerRank(a);
    const [rb, lb] = ownerRank(b);
    if (ra !== rb) return ra - rb;
    const cmp = la.localeCompare(lb, 'tr');
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, 'tr');
  });
  return (
    <div className="space-y-1">
      <select
        className="input"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">Tüm ürün türleri</option>
        {categories?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <SearchSelect
        value={value}
        placeholder={
          ownerCustomerId ? 'Sahibin malzemesini ara/seç…' : 'Malzeme/plaka ara/seç…'
        }
        emptyText="Uygun malzeme yok."
        options={sorted.map((p) => ({
          id: p.id,
          label: p.name,
          // Sahiplere göre gruplama — kimin malı olduğu başlıktan okunur.
          group: `👤 ${plateOwnerLabel(p)}`,
          sublabel: platePickSublabel(p),
          // Kesilmiş (tam olmayan) tabakanın kalan ebadı vurgulanır.
          subtone: isPartialSheet(p) ? ('warn' as const) : undefined,
          highlight: highlightIds?.has(p.id),
        }))}
        onChange={(id) => onPick(id, sorted.find((p) => p.id === id))}
      />
    </div>
  );
}

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

const STATUS: Record<QuoteStatus, { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Gönderildi', cls: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Kabul', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Red', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Süresi doldu', cls: 'bg-amber-100 text-amber-700' },
  converted: { label: 'Dönüştürüldü', cls: 'bg-slate-900 text-white' },
};

export function QuotesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [filters, setFilters] = useState<QuoteFilters>({ page: 1, limit: 50 });
  const { mini, toggle: toggleMini } = useListDensity();

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', filters],
    queryFn: () => fetchQuotes(filters),
  });
  // Filtre açılır listeleri için müşteri ve tür (kategori) listeleri.
  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => fetchCustomers({ page: 1, limit: 100, sort: 'name' }),
  });
  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });

  const setFilter = (patch: Partial<QuoteFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const hasFilter = !!(
    filters.buyerCustomerId ||
    filters.status ||
    filters.categoryId ||
    filters.from ||
    filters.to
  );

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) =>
      setQuoteStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteQuote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      // Teklif silme kuyruk işlerini + (varsa) satışı geri alır → ekstre/stok değişir.
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['processing-history'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  function handleDeleteQuote(id: string, quoteNo: string) {
    if (
      window.confirm(
        `${quoteNo} teklifini silmek istiyor musunuz? Teklife ait tüm kuyruk işleri ve (varsa) satış geri alınır; ilgili borçlar cari ekstreden düşülür.`,
      )
    ) {
      deleteMut.mutate(id);
    }
  }

  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  // #1 Kalem başına değil, dönüşüm başına: işaretliyse işleme işleri hemen
  // "tamamlanmış" olarak eklenir (stok düşer + faturalanır). Teklif id → seçim.
  const [completeOnConvert, setCompleteOnConvert] = useState<
    Record<string, boolean>
  >({});
  const convertMut = useMutation({
    mutationFn: ({
      id,
      completeProcessing,
    }: {
      id: string;
      completeProcessing: boolean;
    }) => convertQuote(id, { completeProcessing }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      const parts: string[] = [];
      if (res.saleId) parts.push('satış oluşturuldu');
      if (res.processingJobIds.length)
        parts.push(`${res.processingJobIds.length} işleme kuyruğa eklendi`);
      setConvertMsg(
        parts.length
          ? `Dönüştürüldü: ${parts.join(' · ')}.`
          : 'Teklif dönüştürüldü.',
      );
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Teklifler</h1>
        <div className="flex items-center gap-2">
          <DensityToggle mini={mini} onToggle={toggleMini} />
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Kapat' : '+ Yeni Teklif'}
          </button>
        </div>
      </div>

      {convertMsg && (
        <div className="card flex items-center justify-between bg-emerald-50 text-sm text-emerald-800">
          <span>{convertMsg}</span>
          <button className="text-emerald-700 underline" onClick={() => setConvertMsg(null)}>
            Kapat
          </button>
        </div>
      )}
      {convertMut.isError && (
        <div className="card text-sm text-red-600">
          {(convertMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Dönüştürme başarısız.'}
        </div>
      )}

      {/* Geçmiş teklif filtresi — tarih aralığı, müşteri, malzeme. */}
      <div className="card space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Başlangıç tarihi</span>
            <input
              className="input"
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => setFilter({ from: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Bitiş tarihi</span>
            <input
              className="input"
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => setFilter({ to: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Müşteri</span>
            <select
              className="input"
              value={filters.buyerCustomerId ?? ''}
              onChange={(e) => setFilter({ buyerCustomerId: e.target.value || undefined })}
            >
              <option value="">Tümü</option>
              {customers?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Malzeme türü</span>
            <select
              className="input"
              value={filters.categoryId ?? ''}
              onChange={(e) => setFilter({ categoryId: e.target.value || undefined })}
            >
              <option value="">Tümü</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {hasFilter
              ? 'Filtre uygulanıyor · karara bağlanmamış teklifler en üstte'
              : 'Filtre yok · son 1 hafta gösteriliyor'}
          </span>
          {hasFilter && (
            <button
              className="text-slate-500 underline"
              onClick={() => setFilters({ page: 1, limit: 50 })}
            >
              Filtreyi temizle
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <NewQuoteForm
          onDone={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['quotes'] });
          }}
        />
      )}

      {/* #8 Onaylanmamış teklifin tam düzenlenmesi. */}
      {editingQuote && (
        <NewQuoteForm
          key={editingQuote.id}
          editQuote={editingQuote}
          onDone={() => {
            setEditingQuote(null);
            qc.invalidateQueries({ queryKey: ['quotes'] });
          }}
        />
      )}

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((q) => (
            <div key={q.id} className={mini ? 'card !p-2 space-y-1' : 'card space-y-2'}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {q.quoteNo}
                    {mini && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {q.buyerCustomer?.name ?? '—'} · {q.items.length} kalem
                      </span>
                    )}
                  </p>
                  {!mini && (
                    <p className="text-sm text-slate-500">
                      {q.buyerCustomer?.name ?? '—'} · {q.items.length} kalem
                    </p>
                  )}
                </div>
                <div className={mini ? 'flex items-center gap-2' : 'text-right'}>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS[q.status].cls}`}
                  >
                    {STATUS[q.status].label}
                  </span>
                  <p className={mini ? 'font-semibold' : 'mt-1 font-semibold'}>
                    {money.format(q.total)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(q.status === 'draft' || q.status === 'sent') && (
                  <>
                    <button
                      className="btn bg-emerald-600 text-white"
                      onClick={() =>
                        statusMut.mutate({ id: q.id, status: 'accepted' })
                      }
                    >
                      Kabul
                    </button>
                    <button
                      className="btn bg-slate-100"
                      onClick={() =>
                        statusMut.mutate({ id: q.id, status: 'rejected' })
                      }
                    >
                      Reddet
                    </button>
                  </>
                )}
                {/* #8 Onaylanmamış (taslak/gönderildi/red) teklif tümüyle düzenlenebilir. */}
                {(q.status === 'draft' ||
                  q.status === 'sent' ||
                  q.status === 'rejected') && (
                  <button
                    className="btn bg-amber-500 text-white"
                    onClick={() =>
                      setEditingQuote(editingQuote?.id === q.id ? null : q)
                    }
                  >
                    {editingQuote?.id === q.id ? 'Düzenlemeyi kapat' : 'Düzenle'}
                  </button>
                )}
                {q.status === 'accepted' && (
                  <>
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={!!completeOnConvert[q.id]}
                        onChange={(e) =>
                          setCompleteOnConvert((s) => ({
                            ...s,
                            [q.id]: e.target.checked,
                          }))
                        }
                      />
                      İşlemeleri tamamlanmış olarak ekle
                    </label>
                    <button
                      className="btn-primary"
                      disabled={convertMut.isPending}
                      onClick={() =>
                        convertMut.mutate({
                          id: q.id,
                          completeProcessing: !!completeOnConvert[q.id],
                        })
                      }
                    >
                      Satış/İşlemeye Dönüştür
                    </button>
                  </>
                )}
                <button
                  className="btn bg-slate-100"
                  onClick={() => openPdf(`/quotes/${q.id}/print`)}
                >
                  Yazdır / PDF
                </button>
                <button
                  className="btn bg-slate-100"
                  onClick={() =>
                    downloadFile(`/quotes/${q.id}/csv`, `teklif-${q.quoteNo}.csv`)
                  }
                >
                  CSV
                </button>
                <button
                  className="btn bg-red-50 text-red-600"
                  disabled={deleteMut.isPending}
                  onClick={() => handleDeleteQuote(q.id, q.quoteNo)}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
          {!data?.items.length && (
            <p className="text-slate-400">Henüz teklif yok.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AveragePriceNote({ plateId }: { plateId: string }) {
  const { data } = useQuery({
    queryKey: ['price-compare', plateId],
    queryFn: () => comparePrices(plateId),
    enabled: !!plateId,
  });
  if (!data?.average) return null;
  return (
    <p className="text-xs text-slate-400">
      Ortalama tedarikçi fiyatı: {data.average.amount} {data.average.currency}
    </p>
  );
}

/** Etiketli form alanı sarmalayıcısı — her input'un ne ifade ettiği açıkça görünsün. */
function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/** #8 Kayıtlı teklif kalemini form kalemine çevirir (düzenleme için). */
function quoteItemToForm(it: Quote['items'][number], quote: Quote): FormItem {
  const consignment =
    it.lineKind === 'sale' && it.stockSource && it.stockSource !== 'business';
  return {
    lineKind: it.lineKind,
    plateId: it.plateId,
    description: it.description,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unitPrice),
    // Kaydedilen tarih (ISO) → tarih input'u için YYYY-MM-DD.
    itemDate: it.itemDate ? String(it.itemDate).slice(0, 10) : undefined,
    billingUnit: it.billingUnit,
    widthMm: it.widthMm != null ? Number(it.widthMm) : undefined,
    heightMm: it.heightMm != null ? Number(it.heightMm) : undefined,
    lengthMeters: it.lengthMeters != null ? Number(it.lengthMeters) : undefined,
    stockSource: it.stockSource,
    commissionPercent:
      it.commissionPercent != null ? Number(it.commissionPercent) : undefined,
    ownerCustomerId: consignment ? quote.ownerCustomerId ?? undefined : undefined,
    ownerMode: consignment ? 'customer' : 'auto',
  };
}

function NewQuoteForm({
  onDone,
  editQuote,
}: {
  onDone: () => void;
  editQuote?: Quote;
}) {
  const [buyerCustomerId, setBuyer] = useState(editQuote?.buyerCustomerId ?? '');
  // Alıcının adı — seçicide alıcının malzemelerini en üstte gruplamak için.
  const [buyerName, setBuyerName] = useState(
    editQuote?.buyerCustomer?.name ?? '',
  );
  const [quoteNote, setQuoteNote] = useState(editQuote?.note ?? '');
  const [items, setItems] = useState<FormItem[]>(
    () => editQuote?.items.map((it) => quoteItemToForm(it, editQuote)) ?? [],
  );
  // Seçilen plakaların önbelleği (sahibe göre filtreli dropdown'lardan gelenler de
  // dahil) — canlı tutar/m² önizlemesi ve AREA ebat alanları için.
  const [plateCache, setPlateCache] = useState<Record<string, Plate>>(() => {
    const seed: Record<string, Plate> = {};
    for (const it of editQuote?.items ?? []) {
      const p = (it as unknown as { plate?: Plate }).plate;
      if (p) seed[p.id] = p;
    }
    return seed;
  });
  // Satış kaleminde malzeme seçilince "işleme kalemi olarak da ekleyelim mi?" sorusu.
  const [askFor, setAskFor] = useState<{ index: number; plateId: string } | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  // #1 Tüm kalemlere ortak birim fiyat/ücret ve not uygulama.
  const [applyPrice, setApplyPrice] = useState('');
  const [applyNote, setApplyNote] = useState('');

  const cachePlate = (p?: Plate) =>
    p && setPlateCache((c) => (c[p.id] ? c : { ...c, [p.id]: p }));
  const getPlate = (id: string): Plate | undefined => plateCache[id];

  // #6 İşleme malzemesi için türlerin standart tabaka ebadı gerekir.
  const { data: templates } = useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
  });

  // Halihazırda üretim kuyruğunda (PENDING/IN_PROGRESS — başlatılmamış olsa bile)
  // olan plakaların id'leri: kaleme eklenince sarı uyarı gösterilir (engellenmez).
  const { data: queueGroups } = useQuery({
    queryKey: ['queue'],
    queryFn: () => fetchQueue(),
  });
  const queuedPlateIds = new Set(
    (queueGroups ?? []).flatMap((g) => g.jobs).map((j) => j.plateId),
  );

  // Alıcının (müşterinin) stoktaki TÜM malzemeleri — tarih sınırı YOK. Ada göre
  // aranıp checkbox ile tek tek işleme kalemi olarak eklenir (bugün/dün dışındaki
  // malzemeler de kolayca eklensin diye). ownerCustomerId filtresi zaten yalnızca
  // o sahibin stoğu > 0 olan (konsinye) malzemelerini döner.
  const { data: buyerPlatesData } = useQuery({
    queryKey: ['plates', 'buyer-stock', buyerCustomerId],
    enabled: !!buyerCustomerId,
    queryFn: () =>
      fetchPlates({ ownerCustomerId: buyerCustomerId, page: 1, limit: 200 }),
  });
  const [selStock, setSelStock] = useState<Set<string>>(new Set());
  const [stockSearch, setStockSearch] = useState('');
  const ownerStockAll = buyerPlatesData?.items ?? [];
  const ownerStock = ownerStockAll.filter((p) => {
    const q = stockSearch.trim().toLocaleLowerCase('tr');
    return !q || p.name.toLocaleLowerCase('tr').includes(q);
  });
  // Henüz teklife eklenmemiş (seçilebilir) filtreli malzemeler.
  const selectableStock = ownerStock.filter(
    (p) => !items.some((x) => x.plateId === p.id),
  );
  const allStockSelected =
    selectableStock.length > 0 &&
    selectableStock.every((p) => selStock.has(p.id));

  // Bir dizi plakayı işleme kalemi olarak ekler (tekilleştirir): tabaka (AREA)
  // ebattan, şerit/rulo vb. kendi ölçü birimiyle.
  const addStockPlates = (plates: typeof ownerStockAll) => {
    const chosen = plates.filter((p) => !items.some((x) => x.plateId === p.id));
    if (!chosen.length) return;
    chosen.forEach(cachePlate);
    setItems((it) => [
      ...it,
      ...chosen.map((p) => {
        const area = !p.measurementType || p.measurementType === 'area';
        return {
          lineKind: 'processing' as const,
          plateId: p.id,
          quantity: 1,
          unitPrice: 0,
          billingUnit: (p.measurementType ?? 'area') as MeasurementType,
          ...(area
            ? { widthMm: Number(p.widthMm), heightMm: Number(p.heightMm) }
            : {}),
        };
      }),
    ]);
    setSelStock(new Set());
  };
  const addSelectedStock = () =>
    addStockPlates(ownerStockAll.filter((p) => selStock.has(p.id)));
  // Tek tıkla: arama sonucundaki (filtreli) tüm malzemeleri ekle.
  const addAllFilteredStock = () => addStockPlates(ownerStock);
  // Tümünü seç / seçimi temizle (yalnızca seçilebilir/filtreli olanlar).
  const toggleSelectAllStock = () =>
    setSelStock((s) => {
      const n = new Set(s);
      if (allStockSelected) selectableStock.forEach((p) => n.delete(p.id));
      else selectableStock.forEach((p) => n.add(p.id));
      return n;
    });

  const createMut = useMutation({
    mutationFn: (input: CreateQuoteInput) =>
      editQuote ? updateQuote(editQuote.id, input) : createQuote(input),
    onSuccess: onDone,
  });

  // #6 Bu müşteriye ait, stokta olan, bugün/dün eklenen ve kalan ebadı tam tabaka
  // olan tüm malzemeleri tek tıkla işleme kalemi olarak ekle.
  const bulkMut = useMutation({
    mutationFn: () =>
      // ownerCustomerId filtresi zaten yalnızca o sahibin stoğu > 0 olan
      // (konsinye) malzemelerini döner; ayrı inStock gerekmez (inStock işletme
      // stoğuna bakar, konsinyede 0'dır).
      fetchPlates({
        ownerCustomerId: buyerCustomerId,
        page: 1,
        limit: 100,
      }),
    onSuccess: (res) => {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const okDates = new Set([iso(new Date()), iso(new Date(Date.now() - 864e5))]);
      const stdById = new Map(
        (templates ?? []).map((t) => [t.id, t.defaultSize] as const),
      );
      const already = new Set(items.map((x) => x.plateId));
      const chosen = res.items.filter((p) => {
        if (already.has(p.id)) return false;
        if (!okDates.has(p.addedAt ?? '')) return false;
        if (!p.templateId) return false;
        const std = stdById.get(p.templateId);
        if (!std) return false;
        // Kalan ebat = standart tabaka ebadı (yani hiç kesilmemiş tam tabaka).
        return (
          Number(p.widthMm) === Number(std.widthMm) &&
          Number(p.heightMm) === Number(std.heightMm)
        );
      });
      if (!chosen.length) {
        setBulkMsg('Uygun (bugün/dün eklenen, tam tabaka) malzeme bulunamadı.');
        return;
      }
      chosen.forEach(cachePlate);
      setItems((it) => [
        ...it,
        ...chosen.map((p) => ({
          lineKind: 'processing' as const,
          plateId: p.id,
          quantity: 1,
          unitPrice: 0,
          billingUnit: 'area' as const,
          widthMm: Number(p.widthMm),
          heightMm: Number(p.heightMm),
        })),
      ]);
      setBulkMsg(`${chosen.length} malzeme işleme kalemi olarak eklendi.`);
    },
  });

  const addItem = (lineKind: 'sale' | 'processing') =>
    setItems((it) => [
      ...it,
      lineKind === 'sale'
        ? { lineKind, plateId: '', quantity: 1, unitPrice: 0, stockSource: 'business' }
        : { lineKind, plateId: '', quantity: 1, unitPrice: 0, billingUnit: 'area' },
    ]);

  // Aynı malzemeyi işleme kalemi olarak ekler (satış kalemindeki soruya "Evet" yanıtı).
  const addProcessingForPlate = (plateId: string) =>
    setItems((it) => [
      ...it,
      { lineKind: 'processing', plateId, quantity: 1, unitPrice: 0, billingUnit: 'area' },
    ]);

  const patch = (i: number, p: Partial<FormItem>) =>
    setItems((it) => it.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const remove = (i: number) =>
    setItems((it) => it.filter((_, idx) => idx !== i));

  // Plaka seçimi (sahibe göre filtreli olabilir): seçilen plakayı önbelleğe al,
  // satış kaleminde işleme-kalemi sorusunu tetikle.
  const onPlatePick = (i: number, lineKind: FormItem['lineKind'], plateId: string, plate?: Plate) => {
    cachePlate(plate);
    // Tabaka satışı tamamen ebattan hesaplandığından adet 1'e sabitlenir.
    const areaSale = lineKind === 'sale' && plate?.measurementType === 'area';
    patch(i, { plateId, ...(areaSale ? { quantity: 1 } : {}) });
    if (lineKind === 'sale') {
      setAskFor(plateId ? { index: i, plateId } : null);
    }
  };

  // #1 Sahip (konsinye) değişince o kalemin plakasını sıfırla (sahibin malzemeleri yeniden listelenir).
  const onOwnerPick = (i: number, ownerId: string) =>
    patch(i, { ownerCustomerId: ownerId || undefined, plateId: '' });

  // Tek teklifte tek malzeme sahibi (satış modeli gereği).
  const distinctOwners = [
    ...new Set(
      items
        .filter((it) => it.lineKind === 'sale' && it.ownerCustomerId)
        .map((it) => it.ownerCustomerId as string),
    ),
  ];
  const ownerConflict = distinctOwners.length > 1;

  const canSubmit =
    buyerCustomerId &&
    items.length > 0 &&
    items.every((i) => i.plateId) &&
    !ownerConflict;

  // Teklif henüz oluşturulmadan satır tutarları + genel toplam (canlı tahmin).
  const grandTotal = items.reduce(
    (sum, it) => sum + quoteLinePreview(it, getPlate(it.plateId))
        .lineTotal,
    0,
  );

  // #D Tahmini kâr (yalnızca MALZEME SATIŞLARINDAN): konsinye ise komisyon geliri,
  // işletmenin kendi malıysa satış tutarının tamamı (maliyet ayrı/giderde tutulur).
  const estimatedSalesProfit = items.reduce((sum, it) => {
    if (it.lineKind !== 'sale') return sum;
    const line = quoteLinePreview(it, getPlate(it.plateId)).lineTotal;
    return (
      sum +
      (it.ownerCustomerId
        ? (line * (Number(it.commissionPercent) || 0)) / 100
        : line)
    );
  }, 0);
  const hasSale = items.some((it) => it.lineKind === 'sale');

  return (
    <div className="card space-y-3">
      <Field label="Alıcı müşteri (ara)">
        <CustomerPicker
          onChange={(id, name) => {
            setBuyer(id);
            setBuyerName(name ?? '');
          }}
          initialName={editQuote?.buyerCustomer?.name}
        />
      </Field>

      {/* #6 Bu müşterinin bugün/dün eklenen tam tabaka malzemelerini tek tıkla
          işleme kalemi olarak ekle. */}
      {buyerCustomerId && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn bg-indigo-600 text-white"
            disabled={bulkMut.isPending}
            onClick={() => {
              setBulkMsg(null);
              bulkMut.mutate();
            }}
          >
            ⚡ Müşterinin tam tabakalarını işleme ekle (bugün/dün)
          </button>
          {bulkMsg && <span className="text-xs text-slate-500">{bulkMsg}</span>}
        </div>
      )}

      {/* Müşterinin stoktaki TÜM malzemeleri (tarih fark etmez) — ada göre aranıp
          checkbox ile tek tek işleme kalemi olarak eklenir. */}
      {buyerCustomerId && ownerStockAll.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              📦 Müşterinin stoktaki malzemeleri ({ownerStockAll.length})
            </p>
            <button
              type="button"
              className="btn bg-emerald-600 px-2 py-1 text-xs text-white"
              disabled={selectableStock.length === 0}
              onClick={addAllFilteredStock}
              title="Arama sonucundaki tüm malzemeleri tek tıkla ekle"
            >
              ⚡ Tümünü işleme ekle ({selectableStock.length})
            </button>
          </div>
          <input
            className="input"
            placeholder="Malzeme adına göre ara…"
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
          />
          {selectableStock.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={allStockSelected}
                onChange={toggleSelectAllStock}
              />
              Tümünü seç ({selectableStock.length})
            </label>
          )}
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {ownerStock.map((p) => {
              const already = items.some((x) => x.plateId === p.id);
              const partial = isPartialSheet(p);
              const rem = plateRemainingLabel(p);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 text-sm ${already ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    disabled={already}
                    checked={already || selStock.has(p.id)}
                    onChange={(e) =>
                      setSelStock((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      })
                    }
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  {rem && (
                    <span
                      className={
                        partial
                          ? 'shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-400'
                          : 'shrink-0 text-xs text-slate-400'
                      }
                    >
                      {partial ? '✂ ' : ''}
                      {rem}
                    </span>
                  )}
                  {already && (
                    <span className="shrink-0 text-xs text-slate-400">(eklendi)</span>
                  )}
                </label>
              );
            })}
            {!ownerStock.length && (
              <p className="text-xs text-slate-400">Eşleşen malzeme yok.</p>
            )}
          </div>
          <button
            className="btn bg-slate-700 text-white"
            disabled={selStock.size === 0}
            onClick={addSelectedStock}
          >
            Seçilenleri işleme kalemi ekle ({selStock.size})
          </button>
        </div>
      )}

      {ownerConflict && (
        <p className="text-sm text-red-600">
          Tek teklifte yalnızca tek malzeme sahibi olabilir. Farklı sahiplerin
          malzemelerini ayrı tekliflerde satın.
        </p>
      )}

      {items.map((item, i) => {
        const plate = getPlate(item.plateId);
        const preview = quoteLinePreview(item, plate);
        return (
        <div key={i} className="rounded-xl border border-slate-200 p-2 space-y-2 dark:border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {item.lineKind === 'sale'
                ? 'Satış kalemi (malzeme satışı)'
                : 'İşleme kalemi (kesim/üretim hizmeti)'}
            </span>
            <button className="text-red-600" onClick={() => remove(i)}>
              Sil
            </button>
          </div>

          {/* Malzeme kaynağı: işletme stoğu / müşteri (konsinye) / tümü.
              Satış kaleminde müşteri seçilirse konsinye (sahip payı) hesabı
              uygulanır; işleme kaleminde yalnızca arama/filtre kolaylığıdır. */}
          <Field
            label={
              item.lineKind === 'sale'
                ? 'Malzeme kaynağı (işletme stoğu / konsinye sahibi)'
                : 'Malzeme kaynağı (filtre)'
            }
          >
            <div className="space-y-1">
              <select
                className="input"
                value={item.ownerMode ?? 'auto'}
                onChange={(e) =>
                  patch(i, {
                    ownerMode: e.target.value as FormItem['ownerMode'],
                    ownerCustomerId: undefined,
                    plateId: '',
                  })
                }
              >
                <option value="auto">
                  {item.lineKind === 'processing'
                    ? 'Alıcının malzemeleri (varsayılan)'
                    : 'Tümü (alıcının kendi malzemeleri hariç)'}
                </option>
                <option value="business">İşletme stoğu</option>
                <option value="customer">Müşteri malzemesi (aratın)</option>
              </select>
              {item.ownerMode === 'customer' && (
                <CustomerPicker
                  placeholder="Sahibini aratarak malzemeyi bulun…"
                  onChange={(id) => onOwnerPick(i, id)}
                />
              )}
            </div>
          </Field>

          <Field
            label={
              item.ownerCustomerId ? 'Sahibin malzemesi / plaka' : 'Malzeme / plaka'
            }
          >
            <PlatePicker
              // Kaynak: 'business' → yalnızca işletme stoğu; 'customer' → seçilen
              // sahibin malzemeleri; 'auto' → TÜMÜ (işletme şeritleri dahil) —
              // işlemede alıcının malzemeleri EN ÜSTTE gruplanır (#5).
              businessOnly={item.ownerMode === 'business'}
              ownerCustomerId={
                item.ownerMode === 'business' ? undefined : item.ownerCustomerId
              }
              preferOwnerName={
                item.lineKind === 'processing' &&
                (item.ownerMode ?? 'auto') === 'auto'
                  ? buyerName || undefined
                  : undefined
              }
              // #2 Satış kaleminde alıcının KENDİ malzemeleri listelenmez
              // (kişiye kendi malını yanlışlıkla satmayı engeller).
              excludeOwnerCustomerId={
                item.lineKind === 'sale' ? buyerCustomerId || undefined : undefined
              }
              value={item.plateId}
              selectedPlate={getPlate(item.plateId)}
              // #7 Bu teklifte başka bir kaleme zaten eklenmiş plakalar ayrı
              // renkte gösterilir (aynı özellikli tabakaları ayırt etmek için).
              highlightIds={
                new Set(
                  items
                    .filter((_, idx) => idx !== i)
                    .map((x) => x.plateId)
                    .filter(Boolean),
                )
              }
              onPick={(plateId, p) => onPlatePick(i, item.lineKind, plateId, p)}
            />
          </Field>

          {/* Bu plaka halihazırda üretim kuyruğunda mı? Engellenmez, ama sarı ve
              belirgin bir uyarı gösterilir (başlat'a basılmamış olsa bile). */}
          {item.plateId && queuedPlateIds.has(item.plateId) && (
            <div className="rounded-lg border-2 border-amber-400 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
              ⚠️ Bu ürün halihazırda üretim kuyruğunda (başlatılmamış olsa bile).
              Yine de teklife ekleyebilirsiniz — mükerrer işleme olmadığından emin
              olun.
            </div>
          )}

          {/* Konsinye komisyonu (yalnızca sahip seçiliyse) — sahibe yansımaz,
              işletme geliri olarak kalır. */}
          {item.lineKind === 'sale' && item.ownerCustomerId && (
            <Field label="İşletme komisyonu % (sahibe görünmez, gelir)">
              <input
                className="input w-40"
                type="number"
                min={0}
                max={100}
                value={item.commissionPercent ?? 0}
                onChange={(e) =>
                  patch(i, { commissionPercent: Number(e.target.value) })
                }
              />
            </Field>
          )}

          {item.lineKind === 'sale' &&
            askFor &&
            askFor.index === i &&
            askFor.plateId === item.plateId && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 p-2 text-sm">
                <span className="text-blue-900">
                  Bu malzemeyi işleme (kesim/üretim) kalemi olarak da ekleyelim mi?
                </span>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn bg-blue-600 text-white"
                    onClick={() => {
                      addProcessingForPlate(item.plateId);
                      setAskFor(null);
                    }}
                  >
                    Evet, ekle
                  </button>
                  <button className="btn bg-slate-100" onClick={() => setAskFor(null)}>
                    Hayır
                  </button>
                </div>
              </div>
            )}

          <div className="flex gap-2">
            {/* Tabaka (AREA) SATIŞINDA adet yoktur: tutar tamamen ebattan (m²)
                hesaplanır. Şerit/rulo (LENGTH) SATIŞINDA yalnızca METRE girilir
                (metre quantity alanında taşınır; satır = metre × TL/m).
                Diğer satış/işleme kalemlerinde adet girilir. */}
            {item.lineKind === 'sale' && plate?.measurementType === 'length' ? (
              <Field label="Uzunluk (metre)" className="flex-1">
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Uzunluk (m)"
                  value={item.quantity}
                  onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                />
              </Field>
            ) : (
              !(item.lineKind === 'sale' && plate?.measurementType === 'area') && (
                <Field label="Adet" className="flex-1">
                  <input
                    className="input"
                    type="number"
                    placeholder="Adet"
                    value={item.quantity}
                    onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                  />
                </Field>
              )
            )}
            <Field
              label={
                item.lineKind === 'sale'
                  ? plate?.measurementType === 'area'
                    ? 'Birim satış fiyatı (TL/m²)'
                    : plate?.measurementType === 'length'
                      ? 'Birim satış fiyatı (TL/metre)'
                      : 'Birim satış fiyatı'
                  : 'Birim işleme ücreti'
              }
              className="flex-1"
            >
              <input
                className={`input ${
                  !Number(item.unitPrice)
                    ? 'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/20'
                    : ''
                }`}
                type="number"
                value={item.unitPrice}
                onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
              />
              {!Number(item.unitPrice) && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  ⚠ Birim fiyat 0 — bu kalem ücretsiz sayılır.
                </p>
              )}
            </Field>
          </div>
          {/* #2 Kalem notu — cari ekstrede satış açıklamasına eklenir. */}
          <Field label="Kalem notu (ekstrede görünür, opsiyonel)">
            <input
              className="input"
              placeholder="Örn. özel kesim / iskonto sebebi…"
              value={item.description ?? ''}
              onChange={(e) => patch(i, { description: e.target.value || undefined })}
            />
          </Field>
          {/* #2 Kaleme özel işlenme/teslim tarihi — dönüşümde işleme işinin
              (processedAt) / satışın (saleDate) tarihine yansır. */}
          <Field label="İşlenme/teslim tarihi (opsiyonel)">
            <input
              className="input w-48"
              type="date"
              value={item.itemDate ?? ''}
              onChange={(e) => patch(i, { itemDate: e.target.value || undefined })}
            />
          </Field>
          {item.lineKind === 'sale' && item.plateId && (
            <AveragePriceNote plateId={item.plateId} />
          )}
          {/* #11 Tabaka (m²) satışında satılacak ebat + "Tamamını sat" */}
          {item.lineKind === 'sale' &&
            (() => {
              const plate = getPlate(item.plateId);
              if (!plate || plate.measurementType !== 'area') return null;
              return (
                <div className="space-y-1 rounded-lg bg-slate-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Satılacak ebat (en × boy, mm) — m² üzerinden fiyatlanır
                    </span>
                    <button
                      className="btn bg-slate-200 text-xs"
                      onClick={() =>
                        patch(i, { widthMm: plate.widthMm, heightMm: plate.heightMm })
                      }
                    >
                      Tamamını sat ({plate.widthMm}×{plate.heightMm})
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="input"
                      type="number"
                      placeholder="en (mm)"
                      value={item.widthMm ?? ''}
                      onChange={(e) =>
                        patch(i, { widthMm: e.target.value ? Number(e.target.value) : undefined })
                      }
                    />
                    <input
                      className="input"
                      type="number"
                      placeholder="boy (mm)"
                      value={item.heightMm ?? ''}
                      onChange={(e) =>
                        patch(i, { heightMm: e.target.value ? Number(e.target.value) : undefined })
                      }
                    />
                  </div>
                </div>
              );
            })()}
          {item.lineKind === 'processing' && (
            <div className="flex gap-2">
              <Field label="Faturalama birimi">
                <select
                  className="input w-auto"
                  value={item.billingUnit}
                  onChange={(e) =>
                    patch(i, {
                      billingUnit: e.target.value as QuoteItemInput['billingUnit'],
                    })
                  }
                >
                  <option value="area">m²</option>
                  <option value="length">metre</option>
                  <option value="piece">adet</option>
                </select>
              </Field>
              {item.billingUnit === 'length' && (
                <Field label="Uzunluk (metre)" className="flex-1">
                  <input
                    className="input"
                    type="number"
                    placeholder="metre"
                    value={item.lengthMeters ?? ''}
                    onChange={(e) => patch(i, { lengthMeters: Number(e.target.value) })}
                  />
                </Field>
              )}
              {item.billingUnit === 'area' && (
                <>
                  <Field label="En (mm)" className="flex-1">
                    <input
                      className="input"
                      type="number"
                      placeholder="en (mm)"
                      value={item.widthMm ?? ''}
                      onChange={(e) => patch(i, { widthMm: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Boy (mm)" className="flex-1">
                    <input
                      className="input"
                      type="number"
                      placeholder="boy (mm)"
                      value={item.heightMm ?? ''}
                      onChange={(e) => patch(i, { heightMm: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {/* Satır tutarı önizleme (teklif oluşturulmadan) */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
            <span className="text-slate-500">
              {preview.measure != null
                ? `${preview.measure.toLocaleString('tr-TR', {
                    maximumFractionDigits: 2,
                  })} ${UNIT_LABEL[preview.unit]} × ${money.format(item.unitPrice || 0)}`
                : 'Tutar için ebat/fiyat girin'}
            </span>
            <span className="font-semibold">{money.format(preview.lineTotal)}</span>
          </div>

          {/* #D Komisyon geliri önizlemesi (konsinye satış) */}
          {item.lineKind === 'sale' && item.ownerCustomerId && (
            <div className="flex items-center justify-between text-xs text-emerald-700">
              <span>
                Komisyon geliriniz (%{Number(item.commissionPercent) || 0})
              </span>
              <span className="font-semibold">
                {money.format(
                  (preview.lineTotal * (Number(item.commissionPercent) || 0)) / 100,
                )}
              </span>
            </div>
          )}
        </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <button className="btn bg-slate-100" onClick={() => addItem('sale')}>
          + Satış kalemi
        </button>
        <button className="btn bg-slate-100" onClick={() => addItem('processing')}>
          + İşleme kalemi
        </button>
      </div>

      {/* #1 Tüm kalemlere ortak birim fiyat/ücret ve not uygula. */}
      {items.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500">
            Tüm kalemlere toplu uygula
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Ortak birim fiyat/ücret" className="w-40">
              <input
                className="input"
                type="number"
                min={0}
                placeholder="örn. 1000"
                value={applyPrice}
                onChange={(e) => setApplyPrice(e.target.value)}
              />
            </Field>
            <Field label="Ortak not (ekstrede görünür)" className="flex-1">
              <input
                className="input"
                placeholder="Tüm kalemlere yazılacak not…"
                value={applyNote}
                onChange={(e) => setApplyNote(e.target.value)}
              />
            </Field>
            <button
              className="btn bg-slate-800 text-white"
              onClick={() =>
                setItems((its) =>
                  its.map((it) => ({
                    ...it,
                    ...(applyPrice !== '' ? { unitPrice: Number(applyPrice) } : {}),
                    ...(applyNote.trim() ? { description: applyNote.trim() } : {}),
                  })),
                )
              }
            >
              Tüm kalemlere uygula ({items.length})
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Girilen alanlar tüm kalemlere yazılır (boş bırakılan alan değiştirilmez).
            Sonrasında kalem bazında yine düzenleyebilirsiniz.
          </p>
        </div>
      )}

      {/* #2 Teklif (tümü) notu — cari ekstrede satış açıklamasına eklenir. */}
      <Field label="Teklif notu (ekstrede görünür, opsiyonel)">
        <textarea
          className="input min-h-[60px] py-2"
          placeholder="Tüm teklif için not… (örn. teslim koşulu, anlaşma)"
          value={quoteNote}
          onChange={(e) => setQuoteNote(e.target.value)}
        />
      </Field>

      {/* Genel toplam + tahmini kâr önizleme */}
      {items.length > 0 && (
        <div className="space-y-1 rounded-xl bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Genel Toplam (tahmini)</span>
            <span className="text-lg font-bold">{money.format(grandTotal)}</span>
          </div>
          {hasSale && (
            <div className="flex items-center justify-between text-xs text-emerald-700">
              <span>Malzeme satışından tahmini kârınız</span>
              <span className="font-semibold">
                {money.format(estimatedSalesProfit)}
              </span>
            </div>
          )}
        </div>
      )}

      <button
        className="btn-primary w-full"
        disabled={!canSubmit || createMut.isPending}
        onClick={() => {
          // Birim fiyatı 0 olan kalem(ler) varsa (ücretsiz) kullanıcıdan onay al.
          const zeroCount = items.filter((it) => !Number(it.unitPrice)).length;
          if (
            zeroCount > 0 &&
            !window.confirm(
              `${zeroCount} kalemin birim fiyatı 0 (ücretsiz). Devam etmek istediğinize emin misiniz?`,
            )
          ) {
            return;
          }
          // #1 Sahibi olan SATIŞ kalemleri konsinye kabul edilir: satış tutarı
          // (komisyon hariç) sahibe yansır, borcundan düşülür. Komisyon işletme
          // geliridir, sahibe görünmez. Tek teklif = tek sahip.
          const ownerCustomerId = distinctOwners[0];
          const mapped: QuoteItemInput[] = items.map((it) => {
            // ownerMode yalnızca arayüz filtresi — backend'e gönderilmez.
            const { ownerCustomerId: oid, ownerMode: _mode, ...rest } = it;
            if (it.lineKind === 'sale' && oid) {
              return {
                ...rest,
                stockSource: 'consignment_tracked',
                ownerSettlement: 'commission_percent',
                commissionPercent: Math.min(
                  100,
                  Math.max(0, Number(it.commissionPercent) || 0),
                ),
              };
            }
            return rest;
          });
          createMut.mutate({
            buyerCustomerId,
            ownerCustomerId: ownerCustomerId || undefined,
            currency: 'TRY',
            note: quoteNote.trim() || undefined,
            items: mapped,
          });
        }}
      >
        {editQuote ? 'Teklifi Güncelle' : 'Teklif Oluştur'}
      </button>
      {createMut.isError && (
        <p className="text-sm text-red-600">
          {(createMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ??
            (editQuote ? 'Teklif güncellenemedi.' : 'Teklif oluşturulamadı.')}
        </p>
      )}
    </div>
  );
}
