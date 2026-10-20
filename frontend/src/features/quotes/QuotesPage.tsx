import { Can } from '../../components/Can';
import { useAuth } from '../../context/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  fetchPlatePricing,
  fetchPlateCosts,
  fetchPlates,
  fetchRetailSuggestions,
  setPlateRetailPrice,
  RETAIL_CURRENCIES,
  type PlateCost,
  type PlatePricing,
  type RetailCurrency,
} from '../../api/materials.api';
import { downloadFile, openPdf } from '../../api/documents.api';
import { fetchQueue } from '../../api/processing.api';
import { isPartialSheet, plateRemainingLabel } from '../../lib/plateLabel';
import { groupPlates, plateCategory } from '../../lib/plateGrouping';
import { SearchSelect } from '../../components/SearchSelect';
import { quoteLinePreview, UNIT_LABEL } from '../../lib/quoteCalc';
import { CustomerPicker } from '../../components/CustomerPicker';
import { groupChipClass } from '../../components/GroupSection';
import { Pagination } from '../../components/Pagination';
import { usePageSize } from '../../hooks/usePageSize';
import { useListDensity, DensityToggle } from '../../context/DensityContext';
import { requestQuoteFolders, updateQuote } from '../../api/quotes.api';
import { QuoteFolders, RunnerBadge, folderPending, runnerSummary, useRunners } from '../../components/RunnerStatus';
import { fetchCutPricing } from '../../api/settings.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { Filters } from '../../components/ui/Filters';
import { SearchInput } from '../../components/ui/SearchInput';
import { DATE_PRESETS, DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { useUrlParam } from '../../hooks/useUrlParam';
import { formatDate, formatMoney, formatNumber, relativeDay } from '../../lib/format';
import { RULE_UNIT_LABEL } from '../../api/price-rules.api';
import { matchesSearch } from '../../lib/search';
import { FacetChips, useFacets } from '../../components/ui/FacetChips';
import { PLATE_FACETS } from '../../lib/catalogKey';
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
  /**
   * Kalemin KONSİNYE SAHİBİ — seçilen malzemenin gerçek sahibinden türetilir
   * (elle seçime bağlı değildir). Dolu ise satış tutarı sahibin borcundan düşer.
   */
  ownerCustomerId?: string;
  ownerMode?: 'auto' | 'business' | 'customer';
  /** Yalnızca liste filtresi: 'customer' kaynağında aranan müşteri. */
  ownerFilterId?: string;
  // Serbest (stoksuz) satış kalemi: plaka seçmeden ad/ölçü/fiyat ile satış.
  adhoc?: boolean;
};

/**
 * Seçilen malzemenin (tek) konsinye sahibi: işletmenin de stoğu varsa ya da
 * malzeme birden çok müşteriye aitse belirsizdir → sahip türetilmez.
 */
function plateOwnerCustomerId(plate?: Plate): string | undefined {
  if (!plate) return undefined;
  if (Number(plate.quantityInStock) > 0) return undefined;
  const ids = plate.ownerCustomerIds ?? [];
  return ids.length === 1 ? ids[0] : undefined;
}

/**
 * Plaka seçici (gerekirse sahibe göre filtreli). Sahip verilirse yalnızca o
 * müşterinin malzemeleri listelenir (#1). Seçilen plaka nesnesi yukarı bildirilir.
 */
/** Bir plakanın sahip etiketi: konsinye ise müşteri adları, değilse "İşletme". */
function plateOwnerLabel(p: Plate): string {
  return p.owners?.length ? p.owners.join(', ') : 'İşletme';
}

/**
 * Seçici alt satırı — PARÇAYA özel bilgi: kalan ebat/uzunluk + sahibi.
 * Tür ve malzeme adı artık grup başlıklarında olduğu için burada tekrarlanmaz.
 */
function platePickSublabel(p: Plate): string {
  const parts: string[] = [];
  if (p.measurementType === 'length') {
    const h = Number(p.heightMm);
    parts.push(`${h ? `${h}mm × ` : ''}${Number(p.quantityInStock)} m`);
  } else {
    const rem = plateRemainingLabel(p);
    if (rem) parts.push(rem);
  }
  parts.push(`👤 ${plateOwnerLabel(p)}`);
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

  // İki seviyeli gruplama: ÜRÜN TÜRÜ → AYNI MALZEME → parçalar.
  // Alıcının kendi malzemeleri en üstte kalsın diye tür grupları önce ona
  // göre sıralanır (aynı tür içinde parçalar da öyle).
  const prefers = (p: Plate) =>
    preferOwnerName && p.owners?.includes(preferOwnerName) ? 0 : 1;
  const groups = groupPlates(merged);
  const options = groups.flatMap((g) =>
    g.materials.flatMap((m) =>
      [...m.plates]
        .sort((a, b) => prefers(a) - prefers(b))
        .map((p) => ({
          id: p.id,
          label: p.name,
          group: `${g.category} (${g.count})`,
          subgroup: m.label,
          sublabel: platePickSublabel(p),
          // Kesilmiş (tam olmayan) tabakanın kalan ebadı vurgulanır.
          subtone: isPartialSheet(p) ? ('warn' as const) : undefined,
          highlight: highlightIds?.has(p.id),
        })),
    ),
  );

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
        options={options}
        onChange={(id) => onPick(id, merged.find((p) => p.id === id))}
      />
    </div>
  );
}


/**
 * Satış kalemi için malzeme seçici.
 *
 * Açılır liste yerine, seçilen malzemeyi bir KART olarak gösterir; değiştirmek
 * için panel açılır. Panelde tür rozetleri (chip), serbest arama ve ürün
 * türüne → aynı malzemeye göre gruplanmış zengin satırlar bulunur: her satırda
 * kalan ebat/stok, sahibi ve (varsa) satış fiyatı görünür. Böylece hangi
 * malzemeyi seçtiğini görmek için listeyi tekrar açmak gerekmez.
 */
function SalePlatePicker({
  businessOnly,
  ownerCustomerId,
  excludeOwnerCustomerId,
  value,
  selectedPlate,
  highlightIds,
  onPick,
}: {
  businessOnly?: boolean;
  ownerCustomerId?: string;
  excludeOwnerCustomerId?: string;
  value: string;
  selectedPlate?: Plate;
  highlightIds?: Set<string>;
  onPick: (plateId: string, plate?: Plate) => void;
}) {
  const [open, setOpen] = useState(!value);
  const [categoryId, setCategoryId] = useState('');
  const [term, setTerm] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });
  const { data, isFetching } = useQuery({
    queryKey: [
      'plates',
      'sale-pick',
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
    enabled: open,
  });

  const all = data?.items ?? [];
  // Sözcük sırası/Türkçe harf/ondalık yazımı fark etmez ("beyaz 2,8 akpolimer").
  const searched = term.trim()
    ? all.filter((p) =>
        matchesSearch(
          `${p.name} ${p.brand ?? ''} ${p.color ?? ''} ${p.colorCode ?? ''} ${p.variant ?? ''} ${
            p.thicknessMm ? `${p.thicknessMm} mm` : ''
          } ${plateCategory(p)} ${plateOwnerLabel(p)}`,
          term,
        ),
      )
    : all;
  // Tür içinde marka / kalınlık / ebat / renk çipleriyle daraltma.
  const facets = useFacets(searched, PLATE_FACETS);
  const groups = groupPlates(facets.filtered);

  // Seçili malzeme: kart olarak özetlenir.
  if (!open && selectedPlate) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-900/20">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {selectedPlate.name}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {[
              plateCategory(selectedPlate),
              platePickSublabel(selectedPlate),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <button
          type="button"
          className="btn-secondary btn-sm shrink-0"
          onClick={() => setOpen(true)}
        >
          Değiştir
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-300 p-2 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <SearchInput
          className="min-w-0 flex-1"
          placeholder="Malzeme, marka veya renk ara…"
          value={term}
          onChange={setTerm}
          autoFocus
        />
        {selectedPlate && (
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            onClick={() => setOpen(false)}
          >
            Vazgeç
          </button>
        )}
      </div>

      {/* Ürün türü rozetleri — açılır liste yerine tek dokunuşla filtre. */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <button
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            categoryId === ''
              ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
          onClick={() => {
            setCategoryId('');
            facets.clear();
          }}
        >
          Tümü
        </button>
        {categories?.map((c) => (
          <button
            key={c.id}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              categoryId === c.id
                ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
            onClick={() => {
              setCategoryId(c.id);
              facets.clear();
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {(categoryId || term.trim()) && <FacetChips facets={PLATE_FACETS} state={facets} />}

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {isFetching && !all.length && (
          <p className="flex items-center justify-center gap-2 py-2 text-xs text-slate-500">
            <Spinner /> Malzemeler yükleniyor…
          </p>
        )}
        {groups.map((g) => (
          <div key={g.category}>
            <span
              className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${groupChipClass(g.category)}`}
            >
              {g.category} ({g.count})
            </span>
            <div className="space-y-1">
              {g.materials.map((m) => (
                <div key={m.key}>
                  <p className="px-1 text-[11px] font-semibold text-slate-500">
                    {m.label}
                    {m.plates.length > 1 && (
                      <span className="ml-1 font-normal text-slate-400">
                        {m.plates.length} parça
                      </span>
                    )}
                  </p>
                  <div className="space-y-1">
                    {m.plates.map((p) => (
                      <button
                        key={p.id}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                          p.id === value
                            ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                        onClick={() => {
                          onPick(p.id, p);
                          setOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {highlightIds?.has(p.id) ? '✓ ' : ''}
                            {p.name}
                          </span>
                          <span
                            className={`block truncate text-[11px] ${
                              isPartialSheet(p)
                                ? 'font-semibold text-amber-700 dark:text-amber-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {platePickSublabel(p)}
                          </span>
                        </span>
                        <PlatePriceBadge plateId={p.id} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!isFetching && !facets.filtered.length && (
          <p className="py-2 text-center text-xs text-slate-400">
            Uygun malzeme yok.
          </p>
        )}
      </div>
    </div>
  );
}

/** İşletmenin kendi stoğundan satış (konsinye / üçüncü kişi malı değil). */
function isOwnStock(it: QuoteItemInput): boolean {
  return !it.stockSource || it.stockSource === 'business';
}

/**
 * Teklifin satın alınmış malzeme kalemlerindeki kâr: satır tutarı − alış
 * maliyeti × miktar (miktar = satır tutarı ÷ birim fiyat). Alış kaydı olan
 * kalem yoksa null.
 */
function quoteProfit(
  q: Quote,
  costs: Record<string, PlateCost> | undefined,
): { profit: number; revenue: number; cost: number; lines: number } | null {
  if (!costs) return null;
  let revenue = 0;
  let cost = 0;
  let lines = 0;
  for (const it of q.items) {
    if (it.lineKind !== 'sale' || !it.plateId || !isOwnStock(it)) continue;
    const c = costs[it.plateId];
    const price = Number(it.unitPrice);
    const total = Number(it.lineTotal);
    if (!c?.unitCost || !(price > 0)) continue;
    revenue += total;
    cost += c.unitCost * (total / price);
    lines++;
  }
  if (!lines) return null;
  return { profit: Math.round((revenue - cost) * 100) / 100, revenue, cost: Math.round(cost * 100) / 100, lines };
}

/** Seçim listesinde malzemenin satış fiyatı rozeti (varsa). */
function PlatePriceBadge({ plateId }: { plateId: string }) {
  const { data } = useQuery({
    queryKey: ['plate-pricing', plateId],
    queryFn: () => fetchPlatePricing(plateId),
    staleTime: 60_000,
  });
  if (!data) return null;
  if (data.suggestedUnitPrice == null) {
    return (
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400 dark:bg-slate-800">
        fiyat yok
      </span>
    );
  }
  return (
    <span className="shrink-0 text-right">
      <span className="block text-xs font-semibold">
        {money.format(data.suggestedUnitPrice)}
      </span>
      <span className="block text-[10px] text-slate-400">
        /{UNIT_LABEL[data.unit]}
        {data.priceSource === 'rule' && (
          <span className="ml-1 text-indigo-500" title={data.rule?.label}>
            çatı
          </span>
        )}
        {data.marginPercent != null && (
          <span
            className={`ml-1 font-semibold ${data.marginPercent < 0 ? 'text-red-600' : 'text-emerald-600'}`}
            title="Önerilen fiyatta alışa göre kâr"
          >
            kâr %{formatNumber(data.marginPercent, 1)}
          </span>
        )}
        {data.discountPercent != null && (
          <span className="ml-1 font-semibold text-emerald-600">
            −%{data.discountPercent}
          </span>
        )}
      </span>
    </span>
  );
}

/** Ölçü birimine doğal karşılık gelen fiyat birimi (çevrim gerekmeyen). */
const NATURAL_PRICE_UNIT: Record<string, string> = {
  area: 'per_m2',
  length: 'per_meter',
  weight: 'per_kg',
  piece: 'per_plate',
};

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

/**
 * Teklif durumları: her durumun kendi rengi var, liste göz ucuyla taranır.
 * cls: durum rozeti · bar: kartın sol şeridi (aynı renk ailesi).
 */
const STATUS: Record<QuoteStatus, { label: string; cls: string; bar: string }> = {
  draft: {
    label: 'Taslak',
    cls: 'bg-slate-200 text-slate-700',
    bar: '!border-l-slate-400',
  },
  sent: {
    label: 'Gönderildi',
    cls: 'bg-blue-100 text-blue-800',
    bar: '!border-l-blue-500',
  },
  accepted: {
    label: 'Kabul edildi',
    cls: 'bg-emerald-100 text-emerald-800',
    bar: '!border-l-emerald-500',
  },
  rejected: {
    label: 'Reddedildi',
    cls: 'bg-red-100 text-red-800',
    bar: '!border-l-red-500',
  },
  expired: {
    label: 'Süresi doldu',
    cls: 'bg-amber-100 text-amber-800',
    bar: '!border-l-amber-500',
  },
  converted: {
    label: 'Dönüştürüldü',
    cls: 'bg-indigo-100 text-indigo-800',
    bar: '!border-l-indigo-500',
  },
};

export function QuotesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [pageSize, setPageSize] = usePageSize('quotes', 20);
  const [filters, setFilters] = useState<QuoteFilters>({ page: 1, limit: pageSize });
  const changePageSize = (n: number) => {
    setPageSize(n);
    setFilters((f) => ({ ...f, limit: n, page: 1 }));
  };
  const { mini, toggle: toggleMini } = useListDensity();

  // Serbest arama (teklif no / müşteri adı): her harfte istek gitmesin diye
  // yazma bitince (~300 ms) filtreye yazılır.
  const [searchText, setSearchText] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchText.trim() || undefined;
      setFilters((f) => (f.search === next ? f : { ...f, search: next, page: 1 }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchText]);

  // Hızlı arama (Ctrl+K) bağlantıları: ?new=1 yeni teklif formunu açar (yazma
  // izni varsa), ?q=… aramayı doldurur (beklemeden uygulanır).
  const { can } = useAuth();
  useUrlParam('new', () => {
    if (can('quotes', 'write')) setShowForm(true);
  });
  useUrlParam('q', (value) => {
    setSearchText(value);
    setFilters((f) => ({ ...f, search: value.trim() || undefined, page: 1 }));
  });

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', filters],
    queryFn: () => fetchQuotes(filters),
    // Yeni dönen ya da klasörü istenen teklif varken klasörün açıldığı
    // kendiliğinden görünsün.
    refetchInterval: (query) =>
      query.state.data?.items.some((q) => folderPending(q)) ? 8_000 : false,
  });
  // Listedeki satış kalemlerinin alış maliyeti: kartta kâr gösterilir.
  const costIds = [
    ...new Set(
      (data?.items ?? []).flatMap((q) =>
        q.items.filter((it) => it.lineKind === 'sale' && it.plateId && isOwnStock(it)).map((it) => it.plateId!),
      ),
    ),
  ].sort();
  const { data: costs } = useQuery({
    queryKey: ['plate-costs', costIds.join(',')],
    queryFn: () => fetchPlateCosts(costIds),
    enabled: costIds.length > 0,
    staleTime: 60_000,
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
  // Sunucu da aynı kuralı uygular: hiçbir filtre (arama dahil) yoksa son 1 hafta.
  const hasFilter = !!(
    filters.buyerCustomerId ||
    filters.status ||
    filters.categoryId ||
    filters.from ||
    filters.to ||
    filters.search
  );
  // Etkin filtre sayısı (tarih aralığı tek filtre sayılır).
  const activeCount =
    (filters.from || filters.to ? 1 : 0) +
    (filters.buyerCustomerId ? 1 : 0) +
    (filters.categoryId ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.search ? 1 : 0);
  const clearFilters = () => {
    setSearchText('');
    setFilters({ page: 1, limit: pageSize });
  };
  // Boş listede tek dokunuşla daha geniş aralık: son 30 gün.
  const showLast30Days = () => {
    const preset = DATE_PRESETS.find((p) => p.key === '30d');
    if (preset) setFilter(preset.range());
  };

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

  async function handleDeleteQuote(id: string, quoteNo: string) {
    const ok = await confirmDialog({
      title: `${quoteNo} silinsin mi?`,
      message:
        'Teklife ait tüm kuyruk işleri ve (varsa) satış geri alınır; ilgili borçlar cari ekstreden düşülür.',
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    deleteMut.mutate(id, {
      // Silinen teklif düzenleniyorsa form da kapansın.
      onSuccess: () => setEditingQuote((e) => (e?.id === id ? null : e)),
    });
  }

  // Dönüşüm sonucu: kısa özet + işleme eklendiyse kuyruğa geçiş bağlantısı.
  const [convertMsg, setConvertMsg] = useState<{ text: string; queued: number } | null>(null);
  // #1 Kalem başına değil, dönüşüm başına: işaretliyse işleme işleri hemen
  // "tamamlanmış" olarak eklenir (stok düşer + faturalanır). Teklif id → seçim.
  const [completeOnConvert, setCompleteOnConvert] = useState<
    Record<string, boolean>
  >({});
  // Dükkân bilgisayarındaki runner (klasörleri açan) ve klasör isteği.
  const { data: runners } = useRunners();
  const folderMut = useMutation({
    mutationFn: (id: string) => requestQuoteFolders(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });

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
      const runner = runnerSummary(qc.getQueryData(['corel-runners']));
      parts.push(
        runner.tone === 'ok' || runner.tone === 'warn'
          ? 'klasörler dükkân bilgisayarında açılıyor'
          : `klasörler açılamayacak: ${runner.text.toLowerCase()}`,
      );
      setConvertMsg({
        text: parts.length
          ? `Dönüştürüldü: ${parts.join(' · ')}.`
          : 'Teklif dönüştürüldü.',
        queued: res.processingJobIds.length,
      });
    },
  });

  // Form açılınca (özellikle listedeki "Düzenle"den) ekranı forma kaydır.
  const newFormRef = useRef<HTMLDivElement>(null);
  const editFormRef = useRef<HTMLDivElement>(null);
  const editingId = editingQuote?.id;
  useEffect(() => {
    if (showForm) newFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm]);
  useEffect(() => {
    if (editingId) editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingId]);

  const pagination = data?.meta ? (
    <Pagination
      page={data.meta.page}
      pageCount={data.meta.pageCount}
      total={data.meta.total}
      pageSize={pageSize}
      onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
      onPageSize={changePageSize}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Teklifler"
        icon="📝"
        subtitle="Satış ve işleme kalemlerini tek teklifte toplayın; kabul edilen teklifi satışa ve üretim kuyruğuna dönüştürün."
        actions={
          <>
            <RunnerBadge />
            <DensityToggle mini={mini} onToggle={toggleMini} />
            <Can module="quotes" level="write">
              {showForm ? (
                <button className="btn-secondary" onClick={() => setShowForm(false)}>
                  Kapat
                </button>
              ) : (
                <button
                  className="btn-primary"
                  data-hotkey="n"
                  title="Yeni teklif (N)"
                  onClick={() => setShowForm(true)}
                >
                  + Yeni Teklif
                </button>
              )}
            </Can>
          </>
        }
      />

      {convertMsg && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <span className="font-medium">✓ {convertMsg.text}</span>
          <span className="flex items-center gap-3">
            {convertMsg.queued > 0 && (
              <Can module="processing">
                <Link to="/queue" className="font-semibold underline">
                  Kuyruğa git →
                </Link>
              </Can>
            )}
            <button className="underline" onClick={() => setConvertMsg(null)}>
              Kapat
            </button>
          </span>
        </div>
      )}
      {convertMut.isError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {(convertMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Dönüştürme başarısız.'}
        </div>
      )}

      {showForm && (
        <div ref={newFormRef} className="scroll-mt-4">
          <NewQuoteForm
            onDone={() => {
              setShowForm(false);
              qc.invalidateQueries({ queryKey: ['quotes'] });
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* #8 Onaylanmamış teklifin tam düzenlenmesi. */}
      {editingQuote && (
        <div ref={editFormRef} className="scroll-mt-4">
          <NewQuoteForm
            key={editingQuote.id}
            editQuote={editingQuote}
            onDone={() => {
              setEditingQuote(null);
              qc.invalidateQueries({ queryKey: ['quotes'] });
            }}
            onCancel={() => setEditingQuote(null)}
          />
        </div>
      )}

      {/* Geçmiş teklif filtresi — arama, tarih aralığı, durum, müşteri, malzeme. */}
      <Filters
        search={
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Ara (teklif no, müşteri)…"
            aria-label="Teklif ara"
          />
        }
        activeCount={activeCount}
        onClear={clearFilters}
      >
        <DateRangeFilter
          value={{ from: filters.from, to: filters.to }}
          onChange={(r) => setFilter({ from: r.from, to: r.to })}
          fromLabel="Başlangıç tarihi"
          toLabel="Bitiş tarihi"
          hint={hasFilter ? 'Tüm tarihler' : 'Filtre yok · son 1 hafta gösteriliyor'}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="block min-w-0">
            <span className="label">Durum</span>
            <select
              className="input"
              value={filters.status ?? ''}
              onChange={(e) =>
                setFilter({ status: (e.target.value || undefined) as QuoteStatus | undefined })
              }
            >
              <option value="">Tümü</option>
              {(Object.keys(STATUS) as QuoteStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="label">Müşteri</span>
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
          <label className="block min-w-0">
            <span className="label">Malzeme türü</span>
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
      </Filters>

      {isLoading ? (
        <LoadingBlock rows={4} label="Teklifler yükleniyor…" />
      ) : !data?.items.length ? (
        <>
          {hasFilter ? (
            <EmptyState
              icon="🔍"
              title="Bu filtrelere uyan teklif yok"
              hint="Aramayı değiştirin, tarih aralığını genişletin ya da filtreleri temizleyin."
              action={
                <button className="btn-secondary" onClick={clearFilters}>
                  Filtreleri temizle
                </button>
              }
            />
          ) : (
            <EmptyState
              icon="📝"
              title="Son 1 haftada teklif yok"
              hint="Filtre seçilmediğinde yalnızca son 1 haftanın teklifleri listelenir. Daha eskiler için tarih aralığı seçin ya da yeni bir teklif hazırlayın."
              action={
                <>
                  <button className="btn-secondary" onClick={showLast30Days}>
                    Son 30 günü göster
                  </button>
                  <Can module="quotes" level="write">
                    <button className="btn-primary" onClick={() => setShowForm(true)}>
                      + Yeni Teklif
                    </button>
                  </Can>
                </>
              }
            />
          )}
          {/* Son sayfadaki son kayıt silindiyse geri dönebilmek için. */}
          {(data?.meta.page ?? 1) > 1 && pagination}
        </>
      ) : (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-1 text-xs text-slate-500">
            <span>
              <span className="font-semibold text-slate-700">{data.meta?.total ?? data.items.length} teklif</span>
              {' · '}
              {hasFilter ? 'filtreli' : 'son 1 hafta'}
            </span>
            <span>Karara bağlanmamış teklifler en üstte</span>
          </p>
          {data.items.map((q) => {
            const st = STATUS[q.status];
            const saleCount = q.items.filter((it) => it.lineKind === 'sale').length;
            const procCount = q.items.length - saleCount;
            const kinds =
              saleCount && procCount
                ? `${saleCount} satış + ${procCount} işleme`
                : saleCount
                  ? 'satış'
                  : procCount
                    ? 'işleme'
                    : '';
            const undecided = q.status === 'draft' || q.status === 'sent';
            const editable = undecided || q.status === 'rejected';
            const editing = editingQuote?.id === q.id;
            return (
              <div
                key={q.id}
                className={`card border-l-4 ${st.bar} ${mini ? '!p-2 space-y-1.5' : 'space-y-3'} ${
                  editing ? 'ring-2 ring-blue-400' : ''
                }`}
              >
                {/* Üst satır: teklif no + durum · müşteri · kalem/tarih — sağda toplam */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-900">{q.quoteNo}</span>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className={`truncate font-medium text-slate-700 ${mini ? 'text-xs' : 'mt-0.5 text-sm'}`}>
                      {q.buyerCustomer?.name ?? '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {q.items.length} kalem{kinds && ` (${kinds})`} · {formatDate(q.createdAt)}
                      {!mini && q.validUntil && ` · geçerlilik ${formatDate(q.validUntil)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-bold text-slate-900 ${mini ? 'text-base' : 'text-lg'}`}>
                      {money.format(q.total)}
                    </p>
                    {(() => {
                      const pr = quoteProfit(q, costs);
                      if (!pr) return null;
                      return (
                        <p
                          className={`text-xs font-semibold ${pr.profit < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}
                          title={`Alış kaydı olan ${pr.lines} satış kaleminde: satış ${money.format(pr.revenue)} − alış ${money.format(pr.cost)}`}
                        >
                          {pr.profit < 0 ? 'Zarar' : 'Kâr'} {pr.profit < 0 ? '−' : '+'}
                          {money.format(Math.abs(pr.profit))}
                        </p>
                      );
                    })()}
                    {!mini && (
                      <p className="text-xs text-slate-500">{relativeDay(q.createdAt)}</p>
                    )}
                  </div>
                </div>
                {!mini && q.note && (
                  <p className="line-clamp-2 text-xs italic text-slate-500">“{q.note}”</p>
                )}
                <QuoteFolders
                  quote={q}
                  runners={runners}
                  compact={mini}
                  canRequest={can('quotes', 'write')}
                  requesting={folderMut.isPending && folderMut.variables === q.id}
                  onRequest={() => folderMut.mutate(q.id)}
                />

                {/* Eylemler: sıradaki adım dolgulu, diğerleri ikincil, Sil en sonda. */}
                <div
                  className={`flex flex-wrap items-center gap-2 ${
                    mini ? '' : 'border-t border-slate-100 pt-3'
                  }`}
                >
                  {undecided && (
                    <>
                      <button
                        className="btn-success btn-sm"
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ id: q.id, status: 'accepted' })}
                      >
                        Kabul
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ id: q.id, status: 'rejected' })}
                      >
                        Reddet
                      </button>
                    </>
                  )}
                  {q.status === 'accepted' && (
                    <>
                      {/* İşleme kalemi yoksa "tamamlanmış ekle" seçeneğinin anlamı yok. */}
                      {procCount > 0 && (
                        <label className="flex min-h-[36px] items-center gap-2 text-xs text-slate-600">
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
                      )}
                      <button
                        className="btn-primary btn-sm"
                        disabled={convertMut.isPending}
                        onClick={() =>
                          convertMut.mutate({
                            id: q.id,
                            completeProcessing: !!completeOnConvert[q.id],
                          })
                        }
                      >
                        {convertMut.isPending && convertMut.variables?.id === q.id && (
                          <Spinner />
                        )}
                        Satış/İşlemeye Dönüştür
                      </button>
                    </>
                  )}
                  {/* #8 Onaylanmamış (taslak/gönderildi/red) teklif tümüyle düzenlenebilir. */}
                  {editable && (
                    <button
                      className={editing ? 'btn-ghost btn-sm' : 'btn-secondary btn-sm'}
                      aria-pressed={editing}
                      onClick={() => setEditingQuote(editing ? null : q)}
                    >
                      {editing ? 'Düzenlemeyi kapat' : 'Düzenle'}
                    </button>
                  )}
                  <button
                    className="btn-secondary btn-sm"
                    title="Yazdırılabilir teklif (Ctrl+P ile PDF)"
                    onClick={() => openPdf(`/quotes/${q.id}/print`)}
                  >
                    Yazdır / PDF
                  </button>
                  <button
                    className="btn-secondary btn-sm"
                    title="Teklif kalemlerini CSV (tablo) olarak indir"
                    onClick={() =>
                      downloadFile(`/quotes/${q.id}/csv`, `teklif-${q.quoteNo}.csv`)
                    }
                  >
                    CSV
                  </button>
                  <button
                    className="btn-danger-soft btn-sm ml-auto"
                    disabled={deleteMut.isPending}
                    onClick={() => handleDeleteQuote(q.id, q.quoteNo)}
                  >
                    Sil
                  </button>
                </div>
              </div>
            );
          })}
          {pagination}
        </div>
      )}
    </div>
  );
}

/**
 * Perakende fiyatı olmayan malzeme için fiyat girme paneli.
 *
 * İki yol sunar: tutarı elle yazmak ya da AYNI TÜRDEKİ başka bir malzemenin
 * (farklı marka/renk olabilir) fiyatını olduğu gibi almak. Fiyat TRY, USD ya
 * da EUR girilebilir; hesaplarda baz para birimine çevrilir.
 */
function RetailPriceEditor({
  plateId,
  current,
  onSaved,
  onClose,
}: {
  plateId: string;
  current: PlatePricing;
  onSaved: (pricing: PlatePricing) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(
    current.retailPrice != null ? String(current.retailPrice) : '',
  );
  const [currency, setCurrency] = useState<RetailCurrency>(
    (current.retailCurrency as RetailCurrency) ?? 'TRY',
  );

  const { data: suggestions } = useQuery({
    queryKey: ['retail-suggestions', plateId],
    queryFn: () => fetchRetailSuggestions(plateId),
  });

  const saveMut = useMutation({
    mutationFn: (input: { retailPrice: number; currency: RetailCurrency }) =>
      setPlateRetailPrice(plateId, input),
    onSuccess: (pricing) => {
      qc.invalidateQueries({ queryKey: ['plate-pricing', plateId] });
      qc.invalidateQueries({ queryKey: ['retail-suggestions'] });
      onSaved(pricing);
      onClose();
    },
  });

  const amount = Number(price.replace(',', '.'));
  const valid = Number.isFinite(amount) && amount > 0;

  return (
    <div className="space-y-2 rounded-lg border border-indigo-300 bg-indigo-50 p-2 dark:border-indigo-800 dark:bg-indigo-900/20">
      <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
        Perakende fiyat gir ({UNIT_LABEL[current.unit]} başına)
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-32"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="Tutar"
          aria-label="Perakende fiyat"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          autoFocus
        />
        <select
          className="input w-auto"
          aria-label="Para birimi"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as RetailCurrency)}
        >
          {RETAIL_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={!valid || saveMut.isPending}
          onClick={() => saveMut.mutate({ retailPrice: amount, currency })}
        >
          {saveMut.isPending ? 'Kaydediliyor…' : 'Kaydet ve uygula'}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
          Vazgeç
        </button>
      </div>

      {saveMut.isError && (
        <p className="text-xs text-red-600">Fiyat kaydedilemedi.</p>
      )}

      {/* Aynı türdeki başka malzemelerin fiyatları — tıkla, aynısını kullan. */}
      {!!suggestions?.length && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            Aynı türdeki malzemelerden seç:
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestions.slice(0, 8).map((sug) => (
              <button
                key={sug.plateId}
                className={`rounded-lg border px-2 py-1 text-left text-[11px] hover:bg-white ${
                  sug.sameThickness
                    ? 'border-indigo-300 bg-white dark:bg-slate-900'
                    : 'border-slate-200 bg-slate-50 dark:bg-slate-800'
                }`}
                title="Bu fiyatı alana yaz"
                onClick={() => {
                  setPrice(String(sug.retailPrice));
                  setCurrency(sug.retailCurrency as RetailCurrency);
                }}
              >
                <span className="block font-medium">
                  {[sug.brand, sug.color].filter(Boolean).join(' ') || sug.name}
                  {sug.thicknessMm ? ` · ${sug.thicknessMm}mm` : ''}
                  {sug.sameThickness && (
                    <span className="ml-1 text-indigo-600">aynı kalınlık</span>
                  )}
                </span>
                <span className="block text-slate-500">
                  {sug.retailPrice} {sug.retailCurrency}
                  {sug.retailPriceBase != null &&
                    sug.retailCurrency !== current.baseCurrency && (
                      <> ≈ {money.format(sug.retailPriceBase)}</>
                    )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Satış kaleminin fiyat özeti: perakende + kâr yüzdesinden gelen öneri ve
 * malzemeci fiyatına göre müşterinin kazandığı indirim.
 *
 * Perakende fiyat tanımlı değilse fiyat girme düğmesi gösterilir — satış
 * fiyatı ancak o zaman otomatik önerilebilir.
 *
 * Kullanıcı fiyatı elle değiştirdiyse indirim GİRİLEN fiyata göre yeniden
 * hesaplanır — ekranda gördüğü oran her zaman gerçek satış fiyatına aittir.
 */
function SalePricingNote({
  plateId,
  unitPrice,
  onPriceSuggested,
}: {
  plateId: string;
  unitPrice: number;
  onPriceSuggested: (price: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { data } = useQuery({
    queryKey: ['plate-pricing', plateId],
    queryFn: () => fetchPlatePricing(plateId),
    enabled: !!plateId,
  });
  if (!data) return null;

  const market = data.marketCheapest;
  const price = Number(unitPrice) || 0;
  const liveDiscount =
    market && price > 0 && price < market
      ? Math.round((1 - price / market) * 1000) / 10
      : null;

  // Fiyat girme paneli açıksa onu göster.
  if (editing) {
    return (
      <RetailPriceEditor
        plateId={plateId}
        current={data}
        onClose={() => setEditing(false)}
        onSaved={(pricing) => {
          if (pricing.suggestedUnitPrice != null) {
            onPriceSuggested(pricing.suggestedUnitPrice);
          }
        }}
      />
    );
  }

  // Ne kalem fiyatı ne de uyan bir fiyat çatısı var: eklemeyi öner.
  if (data.priceSource == null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-amber-700 dark:text-amber-400">
          {data.rule
            ? `“${data.rule.label}” çatısının fiyatı çevrilemedi (kur yok) — satış fiyatı önerilemiyor.`
            : 'Bu malzemenin fiyatı yok — satış fiyatı otomatik önerilemiyor.'}
        </span>
        <button
          type="button"
          className="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => setEditing(true)}
        >
          💰 Fiyat ekle
        </button>
        <Link
          to="/price-rules?new=1"
          className="text-[11px] font-medium text-indigo-600 underline dark:text-indigo-400"
        >
          ya da fiyat çatısı tanımla
        </Link>
      </div>
    );
  }

  const rule = data.rule;
  const ruleUnit = rule ? RULE_UNIT_LABEL[rule.unit] : '';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {data.priceSource === 'rule' && rule ? (
        <span>
          <span className="mr-1 rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            Çatı
          </span>
          {rule.label} · {rule.supplierName ?? 'liste fiyatı'} {formatMoney(rule.price, rule.currency)}/{ruleUnit}
          {data.basePrice != null &&
            (rule.unit !== NATURAL_PRICE_UNIT[data.unit] || rule.currency !== data.baseCurrency) && (
              <> (≈ {money.format(data.basePrice)}/{UNIT_LABEL[data.unit]})</>
            )}{' '}
          + %{data.markupPercent} kâr
          {data.suggestedUnitPrice != null && (
            <> → önerilen {money.format(data.suggestedUnitPrice)}</>
          )}
        </span>
      ) : (
        <span>
          Perakende {data.retailPrice} {data.retailCurrency}
          {data.retailCurrency !== data.baseCurrency &&
            data.retailPriceBase != null && (
              <> (≈ {money.format(data.retailPriceBase)})</>
            )}{' '}
          + %{data.markupPercent} kâr
          {data.suggestedUnitPrice != null && (
            <> → önerilen {money.format(data.suggestedUnitPrice)}</>
          )}
          {rule && <span className="text-slate-400"> (kalem fiyatı; çatı: {rule.label})</span>}
        </span>
      )}
      {market != null && <span>Malzemeci en ucuz: {money.format(market)}</span>}
      {liveDiscount != null && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          Piyasadan %{liveDiscount} uygun
        </span>
      )}
      {market != null && liveDiscount == null && price > market + 0.01 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          Piyasa fiyatının üzerinde
        </span>
      )}
      {data.suggestedUnitPrice != null &&
        price > 0 &&
        Math.abs(price - data.suggestedUnitPrice) > 0.01 && (
          <span className="text-slate-400">(fiyat elle değiştirildi)</span>
        )}
      <button
        type="button"
        className="rounded px-1 font-medium text-indigo-600 underline dark:text-indigo-400"
        onClick={() => setEditing(true)}
      >
        fiyatı düzenle
      </button>
    </div>
  );
}

/**
 * Satın alınmış malzemede alış maliyeti ve bu satıştaki kâr: son alış
 * (yoksa aynı ürün türünün son alışı) ölçü birimine çevrilir, girilen
 * fiyat ve miktarla kâr hesaplanır. Alış kaydı yoksa hiçbir şey gösterilmez.
 */
function ProfitNote({
  plateId,
  unitPrice,
  measure,
}: {
  plateId: string;
  unitPrice: number;
  measure: number | null;
}) {
  const { data } = useQuery({
    queryKey: ['plate-pricing', plateId],
    queryFn: () => fetchPlatePricing(plateId),
    enabled: !!plateId,
  });
  const cost = data?.cost;
  if (!cost?.unitCost) return null;
  const unit = UNIT_LABEL[data!.unit];
  const perUnitProfit = unitPrice - cost.unitCost;
  const pct = cost.unitCost > 0 ? Math.round((perUnitProfit / cost.unitCost) * 1000) / 10 : null;
  const total = measure != null && unitPrice > 0 ? perUnitProfit * measure : null;
  const loss = perUnitProfit < 0;
  const purchase =
    data!.unit === 'area'
      ? `${formatMoney(cost.purchaseUnitPrice, cost.currency)}/tabaka`
      : `${formatMoney(cost.purchaseUnitPrice, cost.currency)}/${unit}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span title={cost.source === 'template' ? 'Bu kalemin alış kaydı yok; aynı ürün türünün son alışı kullanıldı.' : undefined}>
        Alış ≈ <b className="text-slate-700 dark:text-slate-200">{money.format(cost.unitCost)}</b>/{unit}
        <span className="text-slate-400">
          {' '}
          ({purchase} · {formatDate(cost.purchaseDate)}
          {cost.supplierName ? ` · ${cost.supplierName}` : ''}
          {cost.source === 'template' ? ' · aynı ürün türü' : ''})
        </span>
      </span>
      {unitPrice > 0 && (
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            loss
              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          }`}
        >
          {loss ? 'Zarar' : 'Kâr'} {total != null ? `${loss ? '−' : '+'}${money.format(Math.abs(total))}` : ''}
          {pct != null && ` · %${formatNumber(Math.abs(pct), 1)}`}
        </span>
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
  required = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Zorunlu alan: etiketin yanında kırmızı yıldız. */
  required?: boolean;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden>
            *
          </span>
        )}
      </span>
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
    // Serbest (stoksuz) kalem: plakasız kaydedilmiş satış kalemi.
    adhoc: it.lineKind === 'sale' && !it.plateId,
    itemName: it.itemName,
    description: it.description,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unitPrice),
    // Kaydedilen tarih (ISO) → tarih input'u için YYYY-MM-DD.
    itemDate: it.itemDate ? String(it.itemDate).slice(0, 10) : undefined,
    billingUnit: it.billingUnit,
    widthMm: it.widthMm != null ? Number(it.widthMm) : undefined,
    heightMm: it.heightMm != null ? Number(it.heightMm) : undefined,
    lengthMeters: it.lengthMeters != null ? Number(it.lengthMeters) : undefined,
    durationMinutes:
      it.durationMinutes != null ? Number(it.durationMinutes) : undefined,
    stockSource: it.stockSource,
    commissionPercent:
      it.commissionPercent != null ? Number(it.commissionPercent) : undefined,
    ownerCustomerId: consignment ? quote.ownerCustomerId ?? undefined : undefined,
    ownerFilterId: consignment ? quote.ownerCustomerId ?? undefined : undefined,
    ownerMode: consignment ? 'customer' : 'auto',
  };
}

function NewQuoteForm({
  onDone,
  onCancel,
  editQuote,
}: {
  onDone: () => void;
  /** Kaydetmeden kapat (başlıktaki ✕ / Vazgeç). */
  onCancel: () => void;
  editQuote?: Quote;
}) {
  // Yeni teklifte ilk alana (alıcı arama) odaklan; düzenlemede odak değişmez.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editQuote)
      rootRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // Süreyle/m² ile işleme: varsayılan saatlik ve m² ücreti, asgari süre.
  const { data: cutPricing } = useQuery({
    queryKey: ['settings', 'cut-pricing'],
    queryFn: fetchCutPricing,
  });
  const minMinutes = cutPricing?.minMinutes ?? 0;
  // #1 Tüm kalemlere ortak birim fiyat/ücret ve not uygulama.
  const [applyPrice, setApplyPrice] = useState('');
  const [applyNote, setApplyNote] = useState('');

  const cachePlate = (p?: Plate) =>
    p && setPlateCache((c) => (c[p.id] ? c : { ...c, [p.id]: p }));
  const getPlate = (id?: string): Plate | undefined =>
    id ? plateCache[id] : undefined;

  // Halihazırda üretim kuyruğunda (PENDING/IN_PROGRESS — başlatılmamış olsa bile)
  // olan plakaların id'leri: kaleme eklenince sarı uyarı gösterilir (engellenmez).
  const { data: queueGroups } = useQuery({
    queryKey: ['queue'],
    queryFn: () => fetchQueue(),
  });
  const queuedPlateIds = new Set(
    (queueGroups ?? []).flatMap((g) => g.jobs).map((j) => j.plateId),
  );

  // Teklife toplu işleme eklemek için stok kaynağı:
  //  - 'owner'    → yalnızca ALICI müşteriye ait (konsinye) stok (varsayılan),
  //  - 'business' → işletmenin kendi stoğu (müşterinin konsinyesi yoksa da seçilebilsin).
  // Not: bir malzemenin "müşteri adına" görünmesi için stoğa MÜŞTERİYE AİT olarak
  // girilmiş olması gerekir (Stok ekleme → Sahiplik: Müşteriye ait).
  const [stockSource, setStockSource] = useState<'owner' | 'business'>('owner');
  const { data: buyerPlatesData } = useQuery({
    queryKey: ['plates', 'quote-stock', stockSource, buyerCustomerId],
    enabled: !!buyerCustomerId,
    queryFn: () =>
      // NOT: limit backend'de en fazla 100'dür (Max(100)); 200 istenirse uç 400
      // döndürüp paneli boş bırakıyordu ("müşterinin malzemeleri görünmüyor").
      stockSource === 'owner'
        ? fetchPlates({ ownerCustomerId: buyerCustomerId, page: 1, limit: 100 })
        : fetchPlates({ owner: 'business', page: 1, limit: 100 }),
  });
  const [selStock, setSelStock] = useState<Set<string>>(new Set());
  const [stockSearch, setStockSearch] = useState('');
  const ownerStockAll = buyerPlatesData?.items ?? [];
  const ownerStock = ownerStockAll.filter((p) => {
    const q = stockSearch.trim().toLocaleLowerCase('tr');
    return !q || p.name.toLocaleLowerCase('tr').includes(q);
  });
  // İki seviyeli gruplama: ÜRÜN TÜRÜ → AYNI MALZEME → parçalar. Aynı malzemenin
  // onlarca parçası tek başlık altında toplanır, liste okunabilir kalır.
  const stockGroups = groupPlates(ownerStock);
  // Varsayılan olarak alt gruplar kapalı; başlığa tıklayınca parçalar açılır.
  const [openMaterials, setOpenMaterials] = useState<Set<string>>(new Set());
  const toggleMaterial = (key: string) =>
    setOpenMaterials((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
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
        const mt = (p.measurementType ?? 'area') as MeasurementType;
        return {
          lineKind: 'processing' as const,
          plateId: p.id,
          quantity: 1,
          unitPrice: 0,
          billingUnit: mt,
          // Tabaka: en/boy; şerit (LENGTH): kalan uzunluk (metre) ön-dolar,
          // yükseklik KULLANILMAZ. Diğer tiplerde ölçü girilmez.
          ...(mt === 'area'
            ? { widthMm: Number(p.widthMm), heightMm: Number(p.heightMm) }
            : mt === 'length'
              ? { lengthMeters: Number(p.quantityInStock) || undefined }
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
    const p: Partial<FormItem> = { plateId };
    if (areaSale) p.quantity = 1;
    // Satış kaleminde sahip, seçilen malzemenin GERÇEK sahibinden gelir: müşteri
    // malzemesi karışık ("Tümü") listeden seçilse de konsinye sayılır ve tutarı
    // sahibinin borcundan düşer. Aksi halde aynı müşterinin ikinci, üçüncü
    // malzemesi "işletme stoğu" gibi kaydolup carisine hiç yansımıyordu.
    if (lineKind === 'sale') {
      p.ownerCustomerId = plateOwnerCustomerId(plate);
    }
    // #2 İşleme kaleminde faturalama birimi, seçilen malzemenin ölçüm tipinden
    // gelir: şeritte (LENGTH) METRE, tabakada (AREA) en/boy. Şeritte kalan uzunluk
    // (metre) ön-doldurulur ve yükseklik/ebat KULLANILMAZ (yükseklik = uzunluk
    // karışıklığını önler).
    if (lineKind === 'processing' && plate && items[i]?.billingUnit === 'time') {
      // Süreyle fiyatlanan iş süreyle kalır; en/boy kullanılan parçadır.
      p.lengthMeters = undefined;
    } else if (lineKind === 'processing' && plate) {
      const mt = (plate.measurementType ?? 'area') as MeasurementType;
      p.billingUnit = mt;
      if (mt === 'length') {
        p.lengthMeters = Number(plate.quantityInStock) || undefined;
        p.widthMm = undefined;
        p.heightMm = undefined;
      } else if (mt === 'area') {
        p.widthMm = plate.widthMm != null ? Number(plate.widthMm) : undefined;
        p.heightMm = plate.heightMm != null ? Number(plate.heightMm) : undefined;
        p.lengthMeters = undefined;
      } else {
        p.widthMm = undefined;
        p.heightMm = undefined;
        p.lengthMeters = undefined;
      }
    }
    patch(i, p);
    if (lineKind === 'sale') {
      setAskFor(plateId ? { index: i, plateId } : null);
      // Satış fiyatı otomatik: perakende fiyat × (1 + kâr%). Konsinye
      // satışta komisyon oranı da ayarlardaki varsayılandan gelir.
      if (plateId) {
        fetchPlatePricing(plateId)
          .then((pricing) => {
            const next: Partial<FormItem> = {};
            if (pricing.suggestedUnitPrice != null) {
              next.unitPrice = pricing.suggestedUnitPrice;
            }
            if (p.ownerCustomerId && pricing.commissionPercent) {
              next.commissionPercent = pricing.commissionPercent;
            }
            if (Object.keys(next).length) patch(i, next);
          })
          .catch(() => undefined);
      }
    }
  };

  // #1 Sahip (konsinye) filtresi değişince o kalemin plakasını sıfırla (sahibin
  // malzemeleri yeniden listelenir). Kalemin sahibi malzeme seçilince belirlenir.
  const onOwnerPick = (i: number, ownerId: string) =>
    patch(i, {
      ownerFilterId: ownerId || undefined,
      ownerCustomerId: undefined,
      plateId: '',
    });

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
    // Her kalem ya bir plaka seçmeli ya da serbest (stoksuz) kalemde ad girmeli.
    items.every((i) => i.plateId || (i.adhoc && i.itemName?.trim())) &&
    !ownerConflict;

  // Teklif henüz oluşturulmadan satır tutarları + genel toplam (canlı tahmin).
  const grandTotal = items.reduce(
    (sum, it) => sum + quoteLinePreview(it, getPlate(it.plateId), minMinutes)
        .lineTotal,
    0,
  );

  // #D Tahmini kâr (yalnızca MALZEME SATIŞLARINDAN): konsinye ise komisyon geliri,
  // işletmenin kendi malıysa satış tutarının tamamı (maliyet ayrı/giderde tutulur).
  const estimatedSalesProfit = items.reduce((sum, it) => {
    if (it.lineKind !== 'sale') return sum;
    const line = quoteLinePreview(it, getPlate(it.plateId), minMinutes).lineTotal;
    return (
      sum +
      (it.ownerCustomerId
        ? (line * (Number(it.commissionPercent) || 0)) / 100
        : line)
    );
  }, 0);
  const hasSale = items.some((it) => it.lineKind === 'sale');

  // Gönder düğmesi neden pasif? Kullanıcıya eksik olanı söyle.
  const submitHint = !buyerCustomerId
    ? 'Önce alıcı müşteriyi seçin.'
    : items.length === 0
      ? 'En az bir satış veya işleme kalemi ekleyin.'
      : !items.every((i) => i.plateId || (i.adhoc && i.itemName?.trim()))
        ? 'Her kalemde malzeme seçin (serbest kalemde malzeme adını yazın).'
        : ownerConflict
          ? 'Farklı sahiplerin malzemeleri aynı teklifte olamaz.'
          : null;

  const submit = async () => {
    // Birim fiyatı 0 olan kalem(ler) varsa (ücretsiz) kullanıcıdan onay al.
    const zeroCount = items.filter((it) => !Number(it.unitPrice)).length;
    if (
      zeroCount > 0 &&
      !(await confirmDialog({
        title: 'Ücretsiz kalem var',
        message: `${zeroCount} kalemin birim fiyatı 0 (ücretsiz). Devam etmek istediğinize emin misiniz?`,
        confirmText: 'Yine de kaydet',
        cancelText: 'Fiyatları düzelt',
        danger: false,
      }))
    ) {
      return;
    }
    // #1 Sahibi olan SATIŞ kalemleri konsinye kabul edilir: satış tutarı
    // (komisyon hariç) sahibe yansır, borcundan düşülür. Komisyon işletme
    // geliridir, sahibe görünmez. Tek teklif = tek sahip.
    const ownerCustomerId = distinctOwners[0];
    const mapped: QuoteItemInput[] = items.map((it) => {
      // ownerMode/ownerFilterId/adhoc yalnızca arayüz durumu — gönderilmez.
      const {
        ownerCustomerId: oid,
        ownerMode: _mode,
        ownerFilterId: _filter,
        adhoc,
        ...rest
      } = it;
      const base: QuoteItemInput = {
        ...rest,
        plateId: it.plateId || undefined,
      };
      // #5 Serbest (stoksuz) kalem: plaka yok; ad + billingUnit gönderilir,
      // stok kaynağı/sahip uygulanmaz.
      if (adhoc) {
        return {
          ...base,
          itemName: it.itemName?.trim() || 'Malzeme',
          stockSource: undefined,
        };
      }
      if (it.lineKind === 'sale' && oid) {
        return {
          ...base,
          stockSource: 'consignment_tracked',
          ownerSettlement: 'commission_percent',
          commissionPercent: Math.min(
            100,
            Math.max(0, Number(it.commissionPercent) || 0),
          ),
        };
      }
      return base;
    });
    createMut.mutate({
      buyerCustomerId,
      ownerCustomerId: ownerCustomerId || undefined,
      currency: 'TRY',
      note: quoteNote.trim() || undefined,
      items: mapped,
    });
  };

  // Sayı alanı yardımcısı: boş → undefined, değilse sayı.
  const num = (v: string) => (v ? Number(v) : undefined);

  return (
    <div ref={rootRef} className="card space-y-4">
      {/* Form başlığı: ne yapıldığı + canlı özet (kalem sayısı, tahmini toplam) */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">
            {editQuote ? `${editQuote.quoteNo} düzenleniyor` : 'Yeni teklif'}
          </h2>
          <p className="text-sm text-slate-500">
            {items.length} kalem · tahmini toplam{' '}
            <span className="font-semibold text-slate-800">{money.format(grandTotal)}</span>
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm shrink-0"
          onClick={onCancel}
          aria-label="Formu kapat"
          title="Kaydetmeden kapat"
        >
          ✕
        </button>
      </div>

      <Field label="Alıcı müşteri (ara)" required>
        <CustomerPicker
          onChange={(id, name) => {
            setBuyer(id);
            setBuyerName(name ?? '');
          }}
          initialName={editQuote?.buyerCustomer?.name}
        />
      </Field>

      {/* Stoktan toplu işleme ekleme: müşterinin (konsinye) VEYA işletme stoğundan,
          MALZEME TÜRÜNE (kategori) göre gruplu, checkbox ile toplu seçim (parça+tam). */}
      {buyerCustomerId && (
        <div className="space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              📦 Stoktan işleme ekle — parça + tam ({ownerStockAll.length})
            </p>
            <button
              type="button"
              className="btn-success btn-sm"
              disabled={selectableStock.length === 0}
              onClick={addAllFilteredStock}
              title="Görünen tüm malzemeleri tek tıkla ekle"
            >
              ⚡ Tümünü işleme ekle ({selectableStock.length})
            </button>
          </div>

          {/* Kaynak: müşterinin konsinye stoğu / işletme stoğu */}
          <div className="flex flex-wrap gap-1 text-xs" role="group" aria-label="Stok kaynağı">
            {(['owner', 'business'] as const).map((src) => (
              <button
                key={src}
                type="button"
                aria-pressed={stockSource === src}
                onClick={() => {
                  setStockSource(src);
                  setSelStock(new Set());
                }}
                className={`min-h-[36px] rounded-lg px-3 font-medium ${
                  stockSource === src
                    ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {src === 'owner' ? 'Müşterinin malzemeleri' : 'İşletme stoğu'}
              </button>
            ))}
          </div>

          <SearchInput
            placeholder="Malzeme adına göre ara…"
            value={stockSearch}
            onChange={setStockSearch}
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

          {/* Ürün türü → aynı malzeme → parçalar (iki seviyeli, katlanabilir) */}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {stockGroups.map((g) => (
              <div key={g.category}>
                <p
                  className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${groupChipClass(g.category)}`}
                >
                  {g.category} ({g.count})
                </p>
                <div className="space-y-1">
                  {g.materials.map((m) => {
                    const open = openMaterials.has(m.key) || m.plates.length === 1;
                    const free = m.plates.filter(
                      (p) => !items.some((x) => x.plateId === p.id),
                    );
                    const allPicked =
                      free.length > 0 && free.every((p) => selStock.has(p.id));
                    return (
                      <div
                        key={m.key}
                        className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"
                      >
                        {/* Alt kategori başlığı: aynı malzemenin tüm parçaları */}
                        <div className="flex items-center gap-2 px-2 py-1">
                          <input
                            type="checkbox"
                            title="Bu malzemenin tüm parçalarını seç"
                            aria-label={`${m.label}: tüm parçaları seç`}
                            disabled={free.length === 0}
                            checked={allPicked}
                            onChange={() =>
                              setSelStock((s) => {
                                const n = new Set(s);
                                if (allPicked) free.forEach((p) => n.delete(p.id));
                                else free.forEach((p) => n.add(p.id));
                                return n;
                              })
                            }
                          />
                          <button
                            type="button"
                            className="flex min-h-[32px] min-w-0 flex-1 items-center gap-1 text-left text-sm"
                            onClick={() => toggleMaterial(m.key)}
                            aria-expanded={m.plates.length > 1 ? open : undefined}
                          >
                            <span className="truncate font-medium">{m.label}</span>
                            <span className="shrink-0 text-xs text-slate-400">
                              {m.plates.length} parça
                            </span>
                            {m.plates.length > 1 && (
                              <span className="shrink-0 text-xs text-slate-400">
                                {open ? '▾' : '▸'}
                              </span>
                            )}
                          </button>
                        </div>

                        {open && (
                          <div className="space-y-1 border-t border-slate-100 px-2 py-1 dark:border-slate-700">
                            {m.plates.map((p) => {
                              const already = items.some((x) => x.plateId === p.id);
                              const partial = isPartialSheet(p);
                              const rem = plateRemainingLabel(p);
                              return (
                                <label
                                  key={p.id}
                                  className={`flex min-w-0 items-center gap-2 py-0.5 pl-4 text-sm ${already ? 'opacity-50' : ''}`}
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
                                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                                    {p.name}
                                  </span>
                                  {(p.measurementType ?? 'area') === 'area' && (
                                    <span
                                      className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${
                                        partial
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                      }`}
                                    >
                                      {partial ? '✂ parça' : 'tam'}
                                    </span>
                                  )}
                                  {rem && (
                                    <span
                                      className={
                                        partial
                                          ? 'shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-400'
                                          : 'shrink-0 text-xs text-slate-400'
                                      }
                                    >
                                      {rem}
                                    </span>
                                  )}
                                  {already && (
                                    <span className="shrink-0 text-xs text-slate-400">
                                      (eklendi)
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!ownerStock.length && (
              <p className="text-xs text-slate-500">
                {stockSource === 'owner'
                  ? 'Bu müşteriye ait (konsinye) stokta malzeme yok. Malzeme, Stok ekleme ekranında “Sahiplik: Müşteriye ait” seçilerek girildiğinde burada görünür. Dilerseniz “İşletme stoğu” sekmesinden seçin.'
                  : 'İşletme stoğunda uygun malzeme bulunamadı.'}
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn-primary btn-sm w-full sm:w-auto"
            disabled={selStock.size === 0}
            onClick={addSelectedStock}
          >
            Seçilenleri işleme kalemi ekle ({selStock.size})
          </button>
        </div>
      )}

      {ownerConflict && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          Tek teklifte yalnızca tek malzeme sahibi olabilir. Farklı sahiplerin
          malzemelerini ayrı tekliflerde satın.
        </p>
      )}

      {/* Kalemler */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Kalemler{items.length > 0 && ` (${items.length})`}
        </h3>
        {items.length > 0 && (
          <span className="text-xs text-slate-500">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            satış
            <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-full bg-indigo-500" aria-hidden />
            işleme
          </span>
        )}
      </div>
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
          Henüz kalem yok. Aşağıdan satış ya da işleme kalemi ekleyin
          {buyerCustomerId ? ' veya yukarıdaki stok listesinden toplu seçin.' : '.'}
        </p>
      )}

      {items.map((item, i) => {
        const plate = getPlate(item.plateId);
        const preview = quoteLinePreview(item, plate, minMinutes);
        // Satış kaleminin ölçü birimi: serbest kalemde kalemin billingUnit'i,
        // plaka seçilmişse plakanın ölçüm tipi. Adet/ebat alanlarını bu belirler.
        const saleUnit: MeasurementType | undefined = item.adhoc
          ? item.billingUnit ?? 'area'
          : plate?.measurementType;
        const isLengthSale = item.lineKind === 'sale' && saleUnit === 'length';
        const isAreaSale = item.lineKind === 'sale' && saleUnit === 'area';
        // #7 Bu teklifte başka bir kaleme zaten eklenmiş plakalar (seçicide ayrı
        // renkte gösterilir; aynı özellikli tabakaları ayırt etmek için).
        const otherPlateIds = new Set(
          items
            .filter((_, idx) => idx !== i)
            .map((x) => x.plateId)
            .filter((v): v is string => !!v),
        );
        return (
        <div
          key={i}
          className={`space-y-3 rounded-xl border border-l-4 border-slate-200 bg-white p-3 dark:border-slate-700 ${
            item.lineKind === 'sale'
              ? '!border-l-emerald-500'
              : '!border-l-indigo-500'
          }`}
        >
          {/* Kalem başlığı: sıra no · tür · malzeme · satır tutarı · sil */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {i + 1}
              </span>
              <span
                className={`badge shrink-0 ${
                  item.lineKind === 'sale'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                }`}
              >
                {item.lineKind === 'sale' ? 'Satış' : 'İşleme'}
              </span>
              <span
                className={`truncate text-sm ${
                  plate?.name || item.itemName ? 'font-medium text-slate-800' : 'italic text-slate-400'
                }`}
              >
                {plate?.name ?? (item.itemName || 'Malzeme seçilmedi')}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-base font-bold text-slate-900">
                {money.format(preview.lineTotal)}
              </span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                title="Kalemi sil"
                aria-label={`${i + 1}. kalemi sil`}
                onClick={() => remove(i)}
              >
                ✕
              </button>
            </span>
          </div>

          {/* #5 Serbest (stoksuz) kalem: yalnızca satış kaleminde. Açıkken plaka
              seçilmez; ad/ölçü/fiyat girilir, stok hareketi olmaz. */}
          {item.lineKind === 'sale' && (
            <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <input
                type="checkbox"
                checked={!!item.adhoc}
                onChange={(e) =>
                  patch(i, {
                    adhoc: e.target.checked,
                    plateId: '',
                    ownerCustomerId: undefined,
                    ownerFilterId: undefined,
                    ownerMode: 'auto',
                    itemName: e.target.checked ? item.itemName ?? '' : undefined,
                    billingUnit: e.target.checked
                      ? item.billingUnit ?? 'area'
                      : undefined,
                    quantity: 1,
                  })
                }
              />
              Stoksuz (serbest) kalem — stoktan seçmeden ad/ölçü/fiyat gir
            </label>
          )}

          {/* Malzeme kaynağı: işletme stoğu / müşteri (konsinye) / tümü.
              Satış kaleminde müşteri seçilirse konsinye (sahip payı) hesabı
              uygulanır; işleme kaleminde yalnızca arama/filtre kolaylığıdır. */}
          {!item.adhoc && (
          <>
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
                    ownerFilterId: undefined,
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
            required
          >
            {item.lineKind === 'sale' ? (
              <SalePlatePicker
                businessOnly={item.ownerMode === 'business'}
                ownerCustomerId={
                  item.ownerMode === 'business' ? undefined : item.ownerFilterId
                }
                excludeOwnerCustomerId={buyerCustomerId || undefined}
                value={item.plateId ?? ''}
                selectedPlate={getPlate(item.plateId)}
                highlightIds={otherPlateIds}
                onPick={(plateId, p) =>
                  onPlatePick(i, item.lineKind, plateId, p)
                }
              />
            ) : (
            <PlatePicker
              // Kaynak: 'business' → yalnızca işletme stoğu; 'customer' → seçilen
              // sahibin malzemeleri; 'auto' → TÜMÜ (işletme şeritleri dahil) —
              // işlemede alıcının malzemeleri EN ÜSTTE gruplanır (#5).
              businessOnly={item.ownerMode === 'business'}
              ownerCustomerId={
                item.ownerMode === 'business' ? undefined : item.ownerFilterId
              }
              // İşleme kaleminde alıcının malzemeleri listenin EN ÜSTÜNDE.
              preferOwnerName={
                (item.ownerMode ?? 'auto') === 'auto'
                  ? buyerName || undefined
                  : undefined
              }
              value={item.plateId ?? ''}
              selectedPlate={getPlate(item.plateId)}
              highlightIds={otherPlateIds}
              onPick={(plateId, p) => onPlatePick(i, item.lineKind, plateId, p)}
            />
            )}
          </Field>
          </>
          )}

          {/* #5 Serbest (stoksuz) kalem alanları: ad + fiyatlama birimi (+ ebat). */}
          {item.adhoc && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50 sm:grid-cols-6">
              <Field label="Malzeme adı (serbest)" required className="col-span-2 sm:col-span-3">
                <input
                  className="input"
                  placeholder="Örn. 3mm Pleksi levha"
                  value={item.itemName ?? ''}
                  onChange={(e) => patch(i, { itemName: e.target.value })}
                />
              </Field>
              <Field
                label="Fiyatlama birimi"
                className={
                  item.billingUnit === 'area' ? 'col-span-2 sm:col-span-1' : 'col-span-2 sm:col-span-3'
                }
              >
                <select
                  className="input"
                  value={item.billingUnit ?? 'area'}
                  onChange={(e) =>
                    patch(i, {
                      billingUnit: e.target.value as QuoteItemInput['billingUnit'],
                      quantity: 1,
                    })
                  }
                >
                  <option value="area">m²</option>
                  <option value="length">metre</option>
                  <option value="piece">adet</option>
                </select>
              </Field>
              {item.billingUnit === 'area' && (
                <>
                  <Field label="En (mm)">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      placeholder="en (mm)"
                      value={item.widthMm ?? ''}
                      onChange={(e) => patch(i, { widthMm: num(e.target.value) })}
                    />
                  </Field>
                  <Field label="Boy (mm)">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      placeholder="boy (mm)"
                      value={item.heightMm ?? ''}
                      onChange={(e) => patch(i, { heightMm: num(e.target.value) })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {/* Bu plaka halihazırda üretim kuyruğunda mı? Engellenmez, ama sarı ve
              belirgin bir uyarı gösterilir (başlat'a basılmamış olsa bile). */}
          {item.plateId && queuedPlateIds.has(item.plateId) && (
            <div
              role="alert"
              className="rounded-lg border-2 border-amber-400 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900"
            >
              ⚠️ Bu ürün halihazırda üretim kuyruğunda (başlatılmamış olsa bile).
              Yine de teklife ekleyebilirsiniz — mükerrer işleme olmadığından emin
              olun.
            </div>
          )}

          {item.lineKind === 'sale' &&
            askFor &&
            askFor.index === i &&
            askFor.plateId === item.plateId && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 p-2 text-sm dark:bg-blue-950/40">
                <span className="min-w-0 flex-1 basis-56 text-blue-900 dark:text-blue-200">
                  Bu malzemeyi işleme (kesim/üretim) kalemi olarak da ekleyelim mi?
                </span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => {
                      addProcessingForPlate(item.plateId!);
                      setAskFor(null);
                    }}
                  >
                    Evet, ekle
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setAskFor(null)}
                  >
                    Hayır
                  </button>
                </div>
              </div>
            )}

          {/* İşleme: faturalama birimi + ölçü (süre / metre / en-boy). */}
          {item.lineKind === 'processing' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field
                label="Faturalama birimi"
                className={
                  item.billingUnit === 'area' || item.billingUnit === 'piece'
                    ? 'col-span-2 sm:col-span-1'
                    : ''
                }
              >
                <select
                  className="input"
                  value={item.billingUnit}
                  onChange={(e) => {
                    const unit = e.target.value as QuoteItemInput['billingUnit'];
                    // Süre seçilince saatlik, m² seçilince m² ücreti gelir
                    // (Ayarlar › Kesim fiyatlandırması'nda tanımlıysa).
                    const rate =
                      unit === 'time'
                        ? cutPricing?.hourlyRate
                        : unit === 'area'
                          ? cutPricing?.areaRate
                          : undefined;
                    patch(i, {
                      billingUnit: unit,
                      ...(rate ? { unitPrice: rate } : {}),
                    });
                  }}
                >
                  <option value="area">m²</option>
                  <option value="time">süre</option>
                  <option value="length">metre</option>
                  <option value="piece">adet</option>
                </select>
              </Field>
              {item.billingUnit === 'time' && (
                <Field label="Süre (dk)">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="dk"
                    value={item.durationMinutes ?? ''}
                    onChange={(e) => patch(i, { durationMinutes: num(e.target.value) })}
                  />
                </Field>
              )}
              {item.billingUnit === 'length' && (
                <Field label="Uzunluk (metre)">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    placeholder="metre"
                    value={item.lengthMeters ?? ''}
                    onChange={(e) => patch(i, { lengthMeters: Number(e.target.value) })}
                  />
                </Field>
              )}
              {(item.billingUnit === 'area' || item.billingUnit === 'time') && (
                <>
                  <Field label={item.billingUnit === 'time' ? 'Kullanılan en (mm)' : 'En (mm)'}>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      placeholder="en (mm)"
                      value={item.widthMm ?? ''}
                      onChange={(e) => patch(i, { widthMm: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={item.billingUnit === 'time' ? 'Kullanılan boy (mm)' : 'Boy (mm)'}>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      placeholder="boy (mm)"
                      value={item.heightMm ?? ''}
                      onChange={(e) => patch(i, { heightMm: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}
          {item.lineKind === 'processing' && item.billingUnit === 'time' && (
            <p className="text-xs text-slate-500">
              Birim fiyat saatliktir.
              {minMinutes > 0 && ` İş en az ${minMinutes} dk'dan faturalanır.`} En/boy,
              tabakanın kullanılan parçası: stoktan o kadarı düşülür ve Corel takım
              yolu klasörüne parça dosyası (u1350x1000) yazar. Tamamı
              kullanıldıysa tabakanın ölçüsü kalsın.
            </p>
          )}

          {/* #11 Tabaka (m²) satışında satılacak ebat + "Tamamını sat" */}
          {item.lineKind === 'sale' &&
            (() => {
              const plate = getPlate(item.plateId);
              if (!plate || plate.measurementType !== 'area') return null;
              return (
                <div className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">
                      Satılacak ebat (en × boy, mm) — m² üzerinden fiyatlanır
                    </span>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() =>
                        patch(i, { widthMm: plate.widthMm, heightMm: plate.heightMm })
                      }
                    >
                      Tamamını sat ({plate.widthMm}×{plate.heightMm})
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="En (mm)">
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        placeholder="en (mm)"
                        value={item.widthMm ?? ''}
                        onChange={(e) => patch(i, { widthMm: num(e.target.value) })}
                      />
                    </Field>
                    <Field label="Boy (mm)">
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        placeholder="boy (mm)"
                        value={item.heightMm ?? ''}
                        onChange={(e) => patch(i, { heightMm: num(e.target.value) })}
                      />
                    </Field>
                  </div>
                </div>
              );
            })()}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Tabaka (AREA) SATIŞINDA adet yoktur: tutar tamamen ebattan (m²)
                hesaplanır. Şerit/rulo (LENGTH) SATIŞINDA yalnızca METRE girilir
                (metre quantity alanında taşınır; satır = metre × TL/m).
                Diğer satış/işleme kalemlerinde adet girilir. */}
            {isLengthSale ? (
              <Field label="Uzunluk (metre)">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="Uzunluk (m)"
                  value={item.quantity}
                  onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                />
              </Field>
            ) : (
              !isAreaSale && (
                <Field label="Adet">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
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
                  ? saleUnit === 'area'
                    ? 'Birim satış fiyatı (TL/m²)'
                    : saleUnit === 'length'
                      ? 'Birim satış fiyatı (TL/metre)'
                      : 'Birim satış fiyatı'
                  : 'Birim işleme ücreti'
              }
            >
              <input
                className={`input ${
                  !Number(item.unitPrice)
                    ? 'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/20'
                    : ''
                }`}
                type="number"
                inputMode="decimal"
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

          {item.lineKind === 'sale' && item.plateId && (
            <div className="space-y-1 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
              <SalePricingNote
                plateId={item.plateId}
                unitPrice={Number(item.unitPrice) || 0}
                onPriceSuggested={(p) => patch(i, { unitPrice: p })}
              />
              {/* Satın alınan (işletmenin) malzemede alışa göre kâr. */}
              {!item.ownerCustomerId && isOwnStock(item) && (
                <ProfitNote
                  plateId={item.plateId}
                  unitPrice={Number(item.unitPrice) || 0}
                  measure={preview.measure}
                />
              )}
              <AveragePriceNote plateId={item.plateId} />
            </div>
          )}

          {/* Konsinye komisyonu (yalnızca sahip seçiliyse) — sahibe yansımaz,
              işletme geliri olarak kalır. */}
          {item.lineKind === 'sale' && item.ownerCustomerId && (
            <Field label="İşletme komisyonu % (sahibe görünmez, gelir)" className="sm:max-w-xs">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={item.commissionPercent ?? 0}
                onChange={(e) =>
                  patch(i, { commissionPercent: Number(e.target.value) })
                }
              />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
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
            <Field label="İşlenme/teslim tarihi (ops.)">
              <input
                className="input"
                type="date"
                value={item.itemDate ?? ''}
                onChange={(e) => patch(i, { itemDate: e.target.value || undefined })}
              />
            </Field>
          </div>

          {/* Satır tutarı önizleme (teklif oluşturulmadan) */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <span className="min-w-0 text-slate-500">
              {preview.unit === 'time'
                ? preview.billedMinutes != null
                  ? `${preview.billedMinutes.toLocaleString('tr-TR', {
                      maximumFractionDigits: 2,
                    })} dk${
                      preview.billedMinutes > Number(item.durationMinutes ?? 0)
                        ? ' (asgari)'
                        : ''
                    } × ${money.format(item.unitPrice || 0)}/saat`
                  : 'Tutar için süre (dk) girin'
                : preview.measure != null
                  ? `${preview.measure.toLocaleString('tr-TR', {
                      maximumFractionDigits: 2,
                    })} ${UNIT_LABEL[preview.unit]} × ${money.format(item.unitPrice || 0)}`
                  : 'Tutar için ebat/fiyat girin'}
            </span>
            <span className="ml-auto whitespace-nowrap">
              <span className="mr-1 text-xs text-slate-500">Satır tutarı</span>
              <span className="text-base font-bold text-slate-900">
                {money.format(preview.lineTotal)}
              </span>
            </span>
          </div>

          {/* #D Komisyon geliri önizlemesi (konsinye satış) */}
          {item.lineKind === 'sale' && item.ownerCustomerId && (
            <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400">
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

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button type="button" className="btn-secondary" onClick={() => addItem('sale')}>
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          + Satış kalemi
        </button>
        <button type="button" className="btn-secondary" onClick={() => addItem('processing')}>
          <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden />
          + İşleme kalemi
        </button>
      </div>

      {/* #1 Tüm kalemlere ortak birim fiyat/ücret ve not uygula. */}
      {items.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-600">
            Tüm kalemlere toplu uygula
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Ortak birim fiyat/ücret">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="örn. 1000"
                value={applyPrice}
                onChange={(e) => setApplyPrice(e.target.value)}
              />
            </Field>
            <Field label="Ortak not (ekstrede görünür)">
              <input
                className="input"
                placeholder="Tüm kalemlere yazılacak not…"
                value={applyNote}
                onChange={(e) => setApplyNote(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="btn-secondary"
              disabled={applyPrice === '' && !applyNote.trim()}
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
          <p className="text-xs text-slate-500">
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
        <div className="space-y-1 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Genel Toplam (tahmini) · {items.length} kalem
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {money.format(grandTotal)}
            </span>
          </div>
          {hasSale && (
            <div className="flex items-center justify-between gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <span>Malzeme satışından tahmini kârınız</span>
              <span className="font-semibold">
                {money.format(estimatedSalesProfit)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn-primary sm:min-w-[200px]"
            disabled={!canSubmit || createMut.isPending}
            onClick={submit}
          >
            {createMut.isPending && <Spinner />}
            {editQuote ? 'Teklifi Güncelle' : 'Teklif Oluştur'}
          </button>
        </div>
        {submitHint && !createMut.isPending && (
          <p className="text-center text-xs text-slate-500 sm:text-right">{submitHint}</p>
        )}
        {createMut.isError && (
          <p role="alert" className="text-sm text-red-600">
            {(createMut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ??
              (editQuote ? 'Teklif güncellenemedi.' : 'Teklif oluşturulamadı.')}
          </p>
        )}
      </div>
    </div>
  );
}
