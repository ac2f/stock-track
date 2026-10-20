import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Can } from '../../components/Can';
import { GroupSection, groupChipClass } from '../../components/GroupSection';
import { ColorPicker } from '../../components/ColorPicker';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { Filters } from '../../components/ui/Filters';
import { SearchInput } from '../../components/ui/SearchInput';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useUrlParam } from '../../hooks/useUrlParam';
import { useDebounced } from '../../hooks/useDebounced';
import {
  REFERENCE_STALE_MS,
  useMaterialCategories,
  useSuppliers,
} from '../../hooks/useReferenceData';
import { useAuth } from '../../context/AuthContext';
import {
  fetchMaterialBrands,
  fetchMaterialColors,
  fetchMaterialSizes,
  fetchMaterialThicknesses,
  RETAIL_CURRENCIES,
  type SupplierPriceUnit,
} from '../../api/materials.api';
import { createSupplier } from '../../api/suppliers.api';
import { fetchPricingSettings } from '../../api/settings.api';
import {
  createPriceRule,
  deletePriceRule,
  deletePriceRuleEntry,
  fetchPriceRules,
  previewPriceRule,
  RULE_UNIT_LABEL,
  setPriceRuleReference,
  updatePriceRule,
  upsertPriceRuleEntry,
  type PriceRule,
  type PriceRuleInput,
} from '../../api/price-rules.api';
import { formatMoney, formatNumber, relativeDay } from '../../lib/format';
import { matchesSearch } from '../../lib/search';
import type { MeasurementType } from '../../types';

function errMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

/** Kategorinin ölçüsüne uygun birimler (tabaka malzemede tabaka ve m²). */
function unitsFor(type: MeasurementType | undefined): SupplierPriceUnit[] {
  switch (type) {
    case 'length':
      return ['per_meter'];
    case 'weight':
      return ['per_kg', 'per_plate'];
    case 'piece':
      return ['per_plate'];
    default:
      return ['per_m2', 'per_plate'];
  }
}

function unitText(unit: SupplierPriceUnit, type?: MeasurementType): string {
  if (unit === 'per_plate' && type && type !== 'area') return 'adet';
  return RULE_UNIT_LABEL[unit];
}

/** Tek seçimli çip satırı: "Hepsi" + değerler. */
function ChipRow<T extends { id: string }>({
  label,
  items,
  value,
  onChange,
  render,
}: {
  label: string;
  items: T[] | undefined;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  render: (item: T) => string;
}) {
  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      on
        ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500'
        : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
    }`;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={chip(!value)} aria-pressed={!value} onClick={() => onChange(null)}>
          Hepsi
        </button>
        {items?.map((it) => (
          <button
            key={it.id}
            type="button"
            className={chip(value === it.id)}
            aria-pressed={value === it.id}
            onClick={() => onChange(value === it.id ? null : it.id)}
          >
            {render(it)}
          </button>
        ))}
        {items && !items.length && (
          <span className="py-1.5 text-xs text-slate-400">Bu türde kayıt yok (Ürün Türleri ekranından eklenir).</span>
        )}
      </div>
    </div>
  );
}

const EMPTY: PriceRuleInput = { categoryId: '' };

/**
 * Fiyat çatıları: bir grup malzemeye malzemeci fiyatı ve referans fiyat.
 * Teklifte stok kaleminin satış fiyatı, kaleme uyan en özel çatının
 * referansından (+ kâr) önerilir.
 */
export function PriceRulesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canWrite = can('catalog', 'write');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<PriceRuleInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const { data: categories } = useMaterialCategories();
  const { data: rules, isLoading } = useQuery({
    queryKey: ['price-rules'],
    queryFn: () => fetchPriceRules(),
  });
  const { data: pricing } = useQuery({
    queryKey: ['settings', 'pricing'],
    queryFn: fetchPricingSettings,
    staleTime: REFERENCE_STALE_MS,
    retry: false,
  });

  const openCreate = (categoryId = categoryFilter) => {
    setEditingId(null);
    const cat = categories?.find((c) => c.id === categoryId);
    setForm({ ...EMPTY, categoryId, unit: cat ? unitsFor(cat.defaultMeasurementType)[0] : undefined });
  };
  useUrlParam('new', () => {
    if (canWrite) openCreate();
  });
  useUrlParam('q', (q) => setSearch(q));
  const formOpen = !!form;
  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [formOpen, editingId]);

  const visible = useMemo(
    () =>
      (rules ?? []).filter(
        (r) =>
          (!categoryFilter || r.categoryId === categoryFilter) &&
          matchesSearch(
            [r.label, r.note, ...r.entries.map((e) => e.supplierName ?? 'liste fiyatı')].join(' '),
            search,
          ),
      ),
    [rules, categoryFilter, search],
  );
  const groups = useMemo(() => {
    const map = new Map<string, PriceRule[]>();
    for (const r of visible) {
      const k = r.category?.name ?? 'Diğer';
      const list = map.get(k);
      if (list) list.push(r);
      else map.set(k, [r]);
    }
    return [...map.entries()];
  }, [visible]);

  const usedCategories = new Set((rules ?? []).map((r) => r.categoryId));
  const globalMarkup = pricing?.saleMarkupPercent;

  return (
    <div className="space-y-4">
      <PageHeader
        icon="💰"
        title="Fiyat Çatıları"
        subtitle={
          <>
            Bir grup malzemeye (tüm pleksiler, 2.8 mm pleksiler, Akpolimer beyaz pleksi…) malzemeci
            fiyatlarını girin, birini <b>çatı fiyatı</b> seçin. Teklifte satış fiyatı buradan önerilir;
            bir kaleme birden çok çatı uyarsa <b>en özel olan</b> geçerlidir.
          </>
        }
        actions={
          !form && (
            <Can module="catalog" level="write">
              <button
                className="btn-primary"
                data-hotkey="n"
                title="Yeni fiyat çatısı (N)"
                onClick={() => openCreate()}
              >
                + Yeni Fiyat Çatısı
              </button>
            </Can>
          )
        }
      />

      {form && (
        <div ref={formRef}>
          <RuleForm
            key={editingId ?? 'new'}
            initial={form}
            editingId={editingId}
            globalMarkup={globalMarkup}
            onCancel={() => {
              setForm(null);
              setEditingId(null);
            }}
            onSaved={(rule) => {
              qc.invalidateQueries({ queryKey: ['price-rules'] });
              qc.invalidateQueries({ queryKey: ['plate-pricing'] });
              setForm(null);
              setEditingId(null);
              setFocusRuleId(rule.id);
            }}
            onGoTo={(id) => {
              setForm(null);
              setEditingId(null);
              setFocusRuleId(id);
            }}
          />
        </div>
      )}

      {!!rules?.length && (
        <Filters
          search={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Ara (çatı, marka, malzemeci)…"
              aria-label="Fiyat çatılarında ara"
            />
          }
        />
      )}

      {!!categories?.length && !!rules?.length && (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {[{ id: '', name: 'Tümü' }, ...categories.filter((c) => usedCategories.has(c.id))].map((c) => (
            <button
              key={c.id}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                categoryFilter === c.id
                  ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : !rules?.length ? (
        <EmptyState
          icon="💰"
          title="Henüz fiyat çatısı yok"
          hint="Örneğin “Tüm pleksiler” için m² fiyatı, “2.8 mm pleksiler” için tabaka fiyatı girin. Teklifte o malzemeyi seçince satış fiyatı kendiliğinden gelir."
          action={
            !form && (
              <Can module="catalog" level="write">
                <button className="btn-primary" onClick={() => openCreate()}>
                  + Yeni Fiyat Çatısı
                </button>
              </Can>
            )
          }
        />
      ) : !visible.length ? (
        <EmptyState
          compact
          icon="🔍"
          title="Uyan çatı yok"
          hint="Aramayı ya da tür seçimini değiştirin."
          action={
            <button
              className="btn-secondary btn-sm"
              onClick={() => {
                setSearch('');
                setCategoryFilter('');
              }}
            >
              Süzgeci temizle
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([cat, list]) => (
            <GroupSection key={cat} title={cat} count={list.length} countLabel="çatı">
              {list.map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  measurement={categories?.find((c) => c.id === r.categoryId)?.defaultMeasurementType}
                  globalMarkup={globalMarkup}
                  canWrite={canWrite}
                  focus={focusRuleId === r.id}
                  onFocused={() => setFocusRuleId(null)}
                  onEdit={() => {
                    setEditingId(r.id);
                    setForm({
                      categoryId: r.categoryId,
                      brandId: r.brandId,
                      thicknessId: r.thicknessId,
                      colorId: r.colorId,
                      sizeId: r.sizeId,
                      variant: r.variant,
                      unit: r.unit,
                      markupPercent: r.markupPercent,
                      note: r.note,
                    });
                  }}
                />
              ))}
            </GroupSection>
          ))}
        </div>
      )}
    </div>
  );
}

/** Çatı kapsamı formu (yeni / düzenle) ve canlı önizleme. */
function RuleForm({
  initial,
  editingId,
  globalMarkup,
  onCancel,
  onSaved,
  onGoTo,
}: {
  initial: PriceRuleInput;
  editingId: string | null;
  globalMarkup?: number;
  onCancel: () => void;
  onSaved: (rule: PriceRule) => void;
  onGoTo: (id: string) => void;
}) {
  const [form, setForm] = useState<PriceRuleInput>(initial);
  const [markup, setMarkup] = useState(initial.markupPercent != null ? String(initial.markupPercent) : '');
  const categoryId = form.categoryId || undefined;

  const { data: categories } = useMaterialCategories();
  const { data: brands } = useQuery({
    queryKey: ['material-brands', categoryId],
    queryFn: () => fetchMaterialBrands(categoryId),
    enabled: !!categoryId,
  });
  const { data: thicknesses } = useQuery({
    queryKey: ['material-thicknesses', categoryId],
    queryFn: () => fetchMaterialThicknesses(categoryId),
    enabled: !!categoryId,
  });
  const { data: colors } = useQuery({
    queryKey: ['material-colors', categoryId],
    queryFn: () => fetchMaterialColors(categoryId),
    enabled: !!categoryId,
  });
  const { data: sizes } = useQuery({
    queryKey: ['material-sizes', categoryId],
    queryFn: () => fetchMaterialSizes(categoryId),
    enabled: !!categoryId,
  });
  const category = categories?.find((c) => c.id === form.categoryId);
  const units = unitsFor(category?.defaultMeasurementType);

  // Önizleme: kapsam her değiştiğinde kaç kalemi kapsadığı, aynısı var mı.
  const scope = {
    categoryId: form.categoryId,
    brandId: form.brandId,
    thicknessId: form.thicknessId,
    colorId: form.colorId,
    sizeId: form.sizeId,
    variant: form.variant?.trim() || null,
    excludeId: editingId ?? undefined,
  };
  // Ek ad (variant) yazılırken her harfte istek gitmesin: kapsam yazma
  // bitince (~300 ms) önizlenir. Karşılaştırma için metne çevrilir (her
  // çizimde yeni nesne oluşur).
  // Tür değişince beklenmez: yoksa 300 ms boyunca önceki türün önizlemesi
  // görünür.
  const scopeKey = useDebounced(JSON.stringify(scope), 300);
  const debouncedScope = useMemo(() => JSON.parse(scopeKey) as typeof scope, [scopeKey]);
  const liveScope = debouncedScope.categoryId === scope.categoryId ? debouncedScope : scope;
  const { data: preview, isFetching: previewing } = useQuery({
    queryKey: ['price-rule-preview', liveScope],
    queryFn: () => previewPriceRule(liveScope),
    enabled: !!form.categoryId,
    // Aynı türde alan değişirken eski sonuç kalsın (titreme olmasın); tür
    // değişince önceki türün sonucu gösterilmesin.
    placeholderData: (prev, prevQuery) =>
      (prevQuery?.queryKey[1] as { categoryId?: string } | undefined)?.categoryId === form.categoryId
        ? prev
        : undefined,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const input: PriceRuleInput = {
        ...form,
        variant: form.variant?.trim() || null,
        markupPercent: markup.trim() === '' ? null : Number(markup.replace(',', '.')),
      };
      return editingId ? updatePriceRule(editingId, input) : createPriceRule(input);
    },
    onSuccess: onSaved,
  });

  const set = (patch: Partial<PriceRuleInput>) => setForm((f) => ({ ...f, ...patch }));
  const markupValid = markup.trim() === '' || Number.isFinite(Number(markup.replace(',', '.')));
  const dup = preview?.duplicate;

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">{editingId ? 'Fiyat çatısını düzenle' : 'Yeni fiyat çatısı'}</h2>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Malzeme türü <span className="text-red-600">*</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {categories?.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={form.categoryId === c.id}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                form.categoryId === c.id
                  ? 'bg-slate-800 text-white ring-2 ring-slate-800 dark:bg-slate-100 dark:text-slate-900'
                  : groupChipClass(c.name)
              }`}
              onClick={() =>
                setForm({
                  categoryId: c.id,
                  unit: unitsFor(c.defaultMeasurementType)[0],
                  note: form.note,
                })
              }
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {!form.categoryId ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">
          Önce malzeme türünü seçin. Sonra isterseniz marka, kalınlık, renk ve ebatla daraltın; boş bırakılan alan
          “hepsi” demektir.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChipRow label="Kalınlık" items={thicknesses} value={form.thicknessId} onChange={(id) => set({ thicknessId: id })} render={(t) => `${formatNumber(t.valueMm)} mm`} />
            <ChipRow
              label="Marka"
              items={brands}
              value={form.brandId}
              onChange={(id) => {
                // Seçili renk kodu başka markanınsa renk seçimi kalkar.
                const colorBrand = colors?.find((c) => c.id === form.colorId)?.brandId;
                set({ brandId: id, ...(colorBrand && colorBrand !== id ? { colorId: null } : {}) });
              }}
              render={(b) => b.name}
            />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Renk ve kod</p>
              <ColorPicker
                colors={colors}
                brands={brands}
                brandId={form.brandId}
                value={form.colorId}
                onChange={(id) => set({ colorId: id })}
                noneLabel="Hepsi"
              />
            </div>
            {category?.defaultMeasurementType === 'area' && (
              <ChipRow
                label="Ebat (standart tabaka)"
                items={sizes}
                value={form.sizeId}
                onChange={(id) =>
                  set({
                    sizeId: id,
                    // Ebat seçilince tabaka fiyatı, kaldırılınca m² fiyatı doğaldır.
                    unit: id ? 'per_plate' : form.unit === 'per_plate' ? 'per_m2' : form.unit,
                  })
                }
                render={(s) => `${Number(s.widthMm)}×${Number(s.heightMm)}`}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block min-w-0">
              <span className="label">Alt tür (isteğe bağlı)</span>
              <input
                className="input"
                placeholder="ör. Dökme / Çekme"
                value={form.variant ?? ''}
                onChange={(e) => set({ variant: e.target.value })}
              />
            </label>
            <label className="block min-w-0">
              <span className="label">Fiyat birimi</span>
              <select
                className="input"
                value={form.unit ?? units[0]}
                onChange={(e) => set({ unit: e.target.value as SupplierPriceUnit })}
              >
                {units.map((u) => (
                  <option key={u} value={u}>
                    {unitText(u, category?.defaultMeasurementType)} başına
                  </option>
                ))}
              </select>
              {form.unit === 'per_plate' && category?.defaultMeasurementType === 'area' && !form.sizeId && (
                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                  Ebat seçilmedi: tabaka fiyatı her kalemin kendi standart tabakasına bölünür.
                </span>
              )}
            </label>
            <label className="block min-w-0">
              <span className="label">Kâr yüzdesi (isteğe bağlı)</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder={globalMarkup != null ? `Genel oran: %${formatNumber(globalMarkup)}` : 'Genel oran'}
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
              />
              {!markupValid && <span className="mt-1 block text-xs text-red-600">Sayı girin.</span>}
            </label>
          </div>

          <label className="block min-w-0">
            <span className="label">Not</span>
            <input
              className="input"
              placeholder="ör. Fiyatlar KDV hariç"
              value={form.note ?? ''}
              onChange={(e) => set({ note: e.target.value })}
            />
          </label>

          {/* Canlı önizleme */}
          <div
            className={`rounded-xl border p-3 text-sm ${
              dup
                ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
            }`}
            aria-live="polite"
          >
            <p className="font-semibold">
              {preview?.label ?? '…'}
              {previewing && <span className="ml-2 text-xs font-normal text-slate-400">hesaplanıyor…</span>}
            </p>
            {dup ? (
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                Bu kapsamda bir çatı zaten var.{' '}
                <button type="button" className="font-semibold underline" onClick={() => onGoTo(dup.id)}>
                  “{dup.label}” çatısına git
                </button>{' '}
                ve fiyatı oraya ekleyin.
              </p>
            ) : preview ? (
              <>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  Stokta <b>{preview.matched}</b> kalemi kapsıyor
                  {preview.matched > 0 && (
                    <>
                      ; <b>{preview.effective}</b> kalemde geçerli olacak
                      {preview.matched > preview.effective &&
                        ` (${preview.matched - preview.effective} kalemde daha özel bir çatı var)`}
                    </>
                  )}
                  .
                </p>
                {!!preview.samples.length && (
                  <p className="mt-1 truncate text-xs text-slate-500">Örnek: {preview.samples.join(' · ')}</p>
                )}
              </>
            ) : null}
          </div>
        </>
      )}

      {saveMut.isError && <p className="text-sm text-red-600">{errMessage(saveMut.error, 'Kaydedilemedi.')}</p>}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          className="btn-primary"
          disabled={!form.categoryId || !!dup || !markupValid || saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? 'Kaydediliyor…' : editingId ? 'Kaydet' : 'Çatıyı oluştur'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          Vazgeç
        </button>
        {!editingId && (
          <span className="self-center text-xs text-slate-400">Malzemeci fiyatlarını oluşturduktan sonra eklersiniz.</span>
        )}
      </div>
    </div>
  );
}

function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'blue' }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  }[tone];
  return <span className={`badge font-normal ${cls}`}>{children}</span>;
}

const OWN = '__own__';

/** Bir çatı: kapsam, çatı fiyatı, malzemeci fiyatları ve ekleme satırı. */
function RuleCard({
  rule,
  measurement,
  globalMarkup,
  canWrite,
  focus,
  onFocused,
  onEdit,
}: {
  rule: PriceRule;
  measurement?: MeasurementType;
  globalMarkup?: number;
  canWrite: boolean;
  focus: boolean;
  onFocused: () => void;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const [supplierId, setSupplierId] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<string>('TRY');
  const [newSupplier, setNewSupplier] = useState('');

  const { data: suppliers } = useSuppliers({ enabled: canWrite });

  useEffect(() => {
    if (!focus) return;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    priceRef.current?.focus({ preventScroll: true });
    onFocused();
  }, [focus, onFocused]);

  const refresh = (r?: PriceRule) => {
    if (r) qc.setQueryData<PriceRule[]>(['price-rules'], (list) => list?.map((x) => (x.id === r.id ? r : x)));
    qc.invalidateQueries({ queryKey: ['price-rules'] });
    qc.invalidateQueries({ queryKey: ['plate-pricing'] });
  };

  const entryMut = useMutation({
    mutationFn: async () => {
      let sid: string | null = supplierId === OWN ? null : supplierId;
      if (supplierId === '__new__') {
        const s = await createSupplier({ name: newSupplier.trim() });
        qc.invalidateQueries({ queryKey: ['suppliers'] });
        sid = s.id;
      }
      return upsertPriceRuleEntry(rule.id, {
        supplierId: sid,
        price: Number(price.replace(',', '.')),
        currency,
        // İlk fiyat kendiliğinden çatı fiyatı olur.
        makeReference: rule.entries.length === 0 ? true : undefined,
      });
    },
    onSuccess: (r) => {
      refresh(r);
      setPrice('');
      setSupplierId('');
      setNewSupplier('');
      setCurrency('TRY');
    },
  });
  const refMut = useMutation({
    mutationFn: (entryId: string | null) => setPriceRuleReference(rule.id, entryId),
    onSuccess: refresh,
    onSettled: () => setChoice(undefined),
  });
  // Seçim tıklanır tıklanmaz görünsün (sunucu yanıtı çatı fiyatını tazeler).
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const selectedRef = choice !== undefined ? choice : rule.referenceEntryId;
  const pickRef = (entryId: string | null) => {
    setChoice(entryId);
    refMut.mutate(entryId);
  };
  const delEntryMut = useMutation({
    mutationFn: (entryId: string) => deletePriceRuleEntry(rule.id, entryId),
    onSuccess: refresh,
  });
  const activeMut = useMutation({
    mutationFn: () => updatePriceRule(rule.id, { isActive: !rule.isActive }),
    onSuccess: refresh,
  });
  const delMut = useMutation({
    mutationFn: () => deletePriceRule(rule.id),
    onSuccess: () => refresh(),
  });

  const existing = rule.entries.find((e) => (supplierId === OWN ? e.supplierId === null : e.supplierId === supplierId));
  const amount = Number(price.replace(',', '.'));
  const canSave =
    !!supplierId &&
    (supplierId !== '__new__' || newSupplier.trim().length > 1) &&
    price !== '' &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    !entryMut.isPending;
  const unit = unitText(rule.unit, measurement);
  const ref0 = rule.reference;
  const markupText =
    rule.markupPercent != null
      ? `Kâr %${formatNumber(rule.markupPercent)} (bu çatıya özel)`
      : `Kâr: genel oran${globalMarkup != null ? ` %${formatNumber(globalMarkup)}` : ''}`;
  const error = entryMut.error ?? refMut.error ?? delEntryMut.error ?? activeMut.error ?? delMut.error;

  return (
    <div ref={ref} className={`card space-y-3 ${rule.isActive ? '' : 'opacity-70'} ${focus ? 'ring-2 ring-blue-500/50' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="break-words">{rule.label}</span>
            {!rule.isActive && <Pill>Pasif</Pill>}
          </h3>
          <p className="flex flex-wrap gap-1.5 text-xs">
            <Pill tone="blue">{unit} başına</Pill>
            <Pill>{markupText}</Pill>
            <Pill tone={rule.coverage.effective ? 'emerald' : 'slate'}>
              {rule.coverage.matched} kalem
              {rule.coverage.matched > 0 && ` · ${rule.coverage.effective} kalemde geçerli`}
            </Pill>
            {rule.coverage.ownPrice > 0 && (
              <Pill tone="amber">{rule.coverage.ownPrice} kalemde kalemin kendi fiyatı var</Pill>
            )}
          </p>
          {rule.note && <p className="text-xs text-slate-500">{rule.note}</p>}
        </div>
        {canWrite && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={onEdit}>
              ✏️ Düzenle
            </button>
            <button className="btn-ghost btn-sm" disabled={activeMut.isPending} onClick={() => activeMut.mutate()}>
              {rule.isActive ? 'Pasifleştir' : 'Etkinleştir'}
            </button>
            <button
              className="btn-danger-soft btn-sm"
              disabled={delMut.isPending}
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: 'Çatı silinsin mi?',
                    message: `"${rule.label}" çatısı ve içindeki malzemeci fiyatları silinecek. Kapsadığı kalemlerde varsa bir üstteki çatı geçerli olur.`,
                    confirmText: 'Sil',
                    danger: true,
                  })
                )
                  delMut.mutate();
              }}
            >
              🗑️ Sil
            </button>
          </div>
        )}
      </div>

      {/* Çatı fiyatı */}
      {ref0 ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Çatı fiyatı
          </span>
          <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
            {formatMoney(ref0.price, ref0.currency)}
            <span className="text-sm font-medium"> / {unit}</span>
          </span>
          {ref0.currency !== 'TRY' && (
            <span className="text-sm text-emerald-700 dark:text-emerald-300">
              {ref0.priceBase != null ? `≈ ${formatMoney(ref0.priceBase)} (son kur)` : 'kur bulunamadı'}
            </span>
          )}
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {ref0.supplierName ?? 'Kendi liste fiyatı'}
            {ref0.autoPicked && rule.entries.length > 1 && ' · en ucuz (otomatik)'}
          </span>
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Henüz fiyat yok — aşağıdan malzemeci fiyatı ekleyin. Fiyat girilene kadar teklifte öneri yapılmaz.
        </p>
      )}

      {/* Malzemeci fiyatları */}
      {rule.entries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div role="radiogroup" aria-label={`${rule.label} çatı fiyatı seçimi`} className="divide-y divide-slate-100 dark:divide-slate-800">
            {rule.entries.length > 1 && (
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <input
                  type="radio"
                  name={`ref-${rule.id}`}
                  checked={!selectedRef}
                  disabled={!canWrite || refMut.isPending}
                  onChange={() => pickRef(null)}
                />
                <span className="text-slate-600 dark:text-slate-300">Otomatik: her zaman en ucuzu</span>
              </label>
            )}
            {rule.entries.map((e) => {
              const isRef = ref0?.entryId === e.id;
              return (
                <div
                  key={e.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${
                    isRef ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''
                  }`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name={`ref-${rule.id}`}
                      checked={selectedRef === e.id || (rule.entries.length === 1 && isRef)}
                      disabled={!canWrite || refMut.isPending}
                      onChange={() => pickRef(e.id)}
                      aria-label={`${e.supplierName ?? 'Kendi liste fiyatı'} çatı fiyatı olsun`}
                    />
                    <span className="min-w-0 truncate font-medium">{e.supplierName ?? 'Kendi liste fiyatı'}</span>
                    {isRef && <Pill tone="emerald">çatı fiyatı</Pill>}
                  </label>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(e.price, e.currency)}
                    {e.currency !== 'TRY' && (
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        {e.priceBase != null ? `≈ ${formatMoney(e.priceBase)}` : 'kur yok'}
                      </span>
                    )}
                  </span>
                  <span className="w-20 text-right text-xs text-slate-400" title={e.priceUpdatedAt}>
                    {relativeDay(e.priceUpdatedAt)}
                  </span>
                  {canWrite && (
                    <span className="flex gap-1">
                      <button
                        className="btn-ghost btn-sm px-2"
                        title="Bu fiyatı güncelle"
                        aria-label={`${e.supplierName ?? 'Kendi liste fiyatı'} fiyatını güncelle`}
                        onClick={() => {
                          setSupplierId(e.supplierId ?? OWN);
                          setPrice(String(e.price));
                          setCurrency(e.currency);
                          priceRef.current?.focus();
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-danger-soft btn-sm px-2"
                        aria-label={`${e.supplierName ?? 'Kendi liste fiyatı'} fiyatını sil`}
                        disabled={delEntryMut.isPending}
                        onClick={async () => {
                          if (
                            await confirmDialog({
                              message: `${e.supplierName ?? 'Kendi liste fiyatı'} fiyatı silinsin mi?`,
                              confirmText: 'Sil',
                            })
                          )
                            delEntryMut.mutate(e.id);
                        }}
                      >
                        🗑️
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fiyat ekleme / güncelleme */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input min-w-0 basis-full sm:basis-56 sm:flex-1"
            aria-label="Malzemeci"
            value={supplierId}
            onChange={(e) => {
              const v = e.target.value;
              setSupplierId(v);
              const ex = rule.entries.find((x) => (v === OWN ? x.supplierId === null : x.supplierId === v));
              if (ex) {
                setPrice(String(ex.price));
                setCurrency(ex.currency);
              }
            }}
          >
            <option value="">Malzemeci seç…</option>
            {suppliers?.filter((s) => s.isActive !== false).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {rule.entries.some((x) => x.supplierId === s.id) ? ' (fiyatı var)' : ''}
              </option>
            ))}
            <option value={OWN}>Kendi liste fiyatım (malzemeci yok)</option>
            <option value="__new__">+ Yeni malzemeci…</option>
          </select>
          {supplierId === '__new__' && (
            <input
              className="input min-w-0 basis-full sm:basis-44"
              placeholder="Malzemeci adı"
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
            />
          )}
          <input
            ref={priceRef}
            className="input w-32"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder={`Fiyat / ${unit}`}
            aria-label={`Fiyat (${unit} başına)`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) entryMut.mutate();
            }}
          />
          <select
            className="input w-auto"
            aria-label="Para birimi"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {RETAIL_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={!canSave} onClick={() => entryMut.mutate()}>
            {entryMut.isPending ? 'Kaydediliyor…' : existing ? 'Güncelle' : 'Fiyat ekle'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{errMessage(error, 'İşlem başarısız.')}</p>}
    </div>
  );
}
