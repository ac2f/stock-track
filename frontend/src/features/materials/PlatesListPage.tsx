import { Can } from '../../components/Can';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  createPlate,
  createPlatesBatch,
  fetchPlatePricing,
  setPlateRetailPrice,
  clearPlateRetailPrice,
  RETAIL_CURRENCIES,
  type BatchPlateItem,
  type RetailCurrency,
  deletePlatePrice,
  depletePlate,
  fetchMaterialBrands,
  fetchMaterialThicknesses,
  fetchMaterialSizes,
  fetchMaterialColors,
  fetchPlateOwners,
  fetchPlatePrices,
  fetchPlateStockLevels,
  fetchPlates,
  transferPlateOwnership,
  updatePlate,
  upsertPlatePrice,
  type CreatePlateInput,
  type PlateFilters,
  type SupplierPriceUnit,
  type TransferOwnershipInput,
  type UpdatePlateInput,
} from '../../api/materials.api';
import { CustomerPicker } from '../../components/CustomerPicker';
import {
  useMaterialCategories,
  useMaterialTemplates,
  useSuppliers,
  useWarehouses,
} from '../../hooks/useReferenceData';
import { useDebounced } from '../../hooks/useDebounced';
import { mapLimit } from '../../lib/concurrency';
import { TemplateFinder } from './TemplateFinder';
import { groupPlates } from '../../lib/plateGrouping';
import { UnitConverter } from '../../components/UnitConverter';
import { GroupSection, groupChipClass } from '../../components/GroupSection';
import { Pagination } from '../../components/Pagination';
import { usePageSize } from '../../hooks/usePageSize';
import { displayPlateName, isPartialSheet, stripNamePlaceholders } from '../../lib/plateLabel';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { Filters } from '../../components/ui/Filters';
import { SearchInput } from '../../components/ui/SearchInput';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { confirmDialog } from '../../components/ConfirmDialog';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { useUrlParam } from '../../hooks/useUrlParam';
import { useAuth } from '../../context/AuthContext';
import {
  useListDensity,
  useListGrouping,
  DensityToggle,
  GroupToggle,
} from '../../context/DensityContext';
import type { MaterialTemplate, Plate } from '../../types';

function areaM2(widthMm?: number, heightMm?: number): number | null {
  if (!widthMm || !heightMm) return null;
  return (widthMm / 1000) * (heightMm / 1000);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Türkçe karakterleri ASCII'ye indirger, büyük harfli tireli koda dönüştürür. */
function slugify(value: string): string {
  const map: Record<string, string> = {
    ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
    Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u',
  };
  return value
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (ch) => map[ch] ?? ch)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Tür Marka[Renk Kod] Kalınlıkxenxboy kalıbında otomatik ad üretir; eksik
 * kısımlar "—" ile gösterilir. Başa malzeme türü (Pleksi, Dekota…) eklenir.
 */
function buildCatalogName(
  type: string | undefined,
  brand: { name: string } | undefined,
  color: { name: string; code?: string } | undefined,
  size: { widthMm: number; heightMm: number } | undefined,
  thickness: { valueMm: number } | undefined,
): string {
  const typePart = type?.trim() ? `${type.trim()} ` : '';
  const brandPart = brand?.name ?? '—';
  const colorPart = color ? (color.code ? `${color.name} ${color.code}` : color.name) : '—';
  const thicknessPart = thickness?.valueMm ?? '—';
  const sizePart = size ? `${size.widthMm}x${size.heightMm}` : '—x—';
  return `${typePart}${brandPart}[${colorPart}] ${thicknessPart}x${sizePart}`;
}

/** Stok kodu önizlemesi: tür + marka + renk(+kod) + kalınlık + tabaka ebatı. */
function buildSku(tpl: MaterialTemplate): string {
  const c = tpl.defaultColor;
  const colorPart = c ? (c.code ? `${c.name} ${c.code}` : c.name) : null;
  const parts = [
    tpl.name,
    tpl.defaultBrand?.name,
    colorPart,
    tpl.defaultThickness ? `${tpl.defaultThickness.valueMm}mm` : null,
    tpl.defaultSize ? `${tpl.defaultSize.widthMm}x${tpl.defaultSize.heightMm}` : null,
  ].filter((p): p is string => !!p);
  return slugify(parts.join('-'));
}

/** Etiketli form alanı sarmalayıcısı — her input'un ne ifade ettiği açıkça görünsün. */
function Field({
  label,
  children,
  hint,
  required = false,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /** Zorunlu alan: etiketin yanında kırmızı * görünür. */
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/** Stok miktarının birimi: rulo/şerit metre, ağırlık kg, diğerleri adet. */
function qtyUnit(plate: Pick<Plate, 'measurementType'>): string {
  return plate.measurementType === 'length'
    ? 'm'
    : plate.measurementType === 'weight'
      ? 'kg'
      : 'adet';
}

/**
 * Miktar rozeti rengi: bitti → kırmızı, yeniden sipariş seviyesinde/altında →
 * sarı, yeterli → yeşil.
 */
function qtyBadgeClass(plate: Pick<Plate, 'quantityInStock' | 'reorderLevel'>): string {
  const qty = Number(plate.quantityInStock) || 0;
  const reorder = Number(plate.reorderLevel);
  if (qty <= 0) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  if (plate.reorderLevel != null && Number.isFinite(reorder) && qty <= reorder)
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
}

/** Miktar rozeti başlığı (üzerine gelince açıklama). */
function qtyBadgeTitle(plate: Pick<Plate, 'quantityInStock' | 'reorderLevel'>): string {
  const qty = Number(plate.quantityInStock) || 0;
  if (qty <= 0) return 'Stokta yok';
  if (plate.reorderLevel != null && qty <= Number(plate.reorderLevel))
    return `Az kaldı (yeniden sipariş seviyesi: ${formatNumber(plate.reorderLevel)})`;
  return 'Stokta';
}

/** Sahip adı(ları); konsinye değilse "İşletme". */
function ownerLabel(plate: Pick<Plate, 'owners'>): string {
  return plate.owners?.length ? plate.owners.join(', ') : 'İşletme';
}

/** Ölçü değeri (mm) → "1350"; boş/sıfır ise null. */
function mm(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

/**
 * Kartta okunur ölçü satırı: "1350×2000 mm · 3 mm kalınlık · 2.70 m²".
 * Eksik ölçüler atlanır (eskiden "0×0×0 mm" görünüyordu).
 */
function plateDimsText(plate: Plate): string {
  const w = mm(plate.widthMm);
  const h = mm(plate.heightMm);
  const t = mm(plate.thicknessMm);
  const m2 = plate.measurementType === 'area' ? areaM2(Number(w), Number(h)) : null;
  return [
    plate.measurementType === 'length'
      ? h
        ? `Yükseklik ${h} mm`
        : ''
      : w && h
        ? `${w}×${h} mm`
        : '',
    t ? `${t} mm kalınlık` : '',
    m2 != null ? `${m2.toFixed(2)} m²` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function errMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? fallback
  );
}

/**
 * Stok listesinde tür seçiliyken marka / kalınlık / ebat / renk çipleri.
 * Değerler o türün kataloğundan gelir; çipe tekrar dokunmak seçimi kaldırır.
 */
function CatalogFilterChips({
  categoryId,
  filters,
  onChange,
}: {
  categoryId: string;
  filters: PlateFilters;
  onChange: (patch: Partial<PlateFilters>) => void;
}) {
  const { data: brands } = useQuery({
    queryKey: ['material-brands', categoryId],
    queryFn: () => fetchMaterialBrands(categoryId),
  });
  const { data: thicknesses } = useQuery({
    queryKey: ['material-thicknesses', categoryId],
    queryFn: () => fetchMaterialThicknesses(categoryId),
  });
  const { data: sizes } = useQuery({
    queryKey: ['material-sizes', categoryId],
    queryFn: () => fetchMaterialSizes(categoryId),
  });
  const { data: colors } = useQuery({
    queryKey: ['material-colors', categoryId],
    queryFn: () => fetchMaterialColors(categoryId),
  });
  const brandId = brands?.find((b) => b.name === filters.brand)?.id;
  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
      on
        ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500'
        : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
    }`;
  const rows: { label: string; items: { key: string; text: string; on: boolean; pick: () => void }[] }[] = [
    {
      label: 'Marka',
      items: (brands ?? []).map((b) => ({
        key: b.id,
        text: b.name,
        on: filters.brand === b.name,
        pick: () => {
          const next = filters.brand === b.name ? undefined : b.name;
          const colorBrand = colors?.find((c) => c.id === filters.colorId)?.brandId;
          onChange({
            brand: next,
            ...(colorBrand && next && colorBrand !== b.id ? { colorId: undefined } : {}),
          });
        },
      })),
    },
    {
      label: 'Kalınlık',
      items: [...(thicknesses ?? [])]
        .sort((a, b) => Number(a.valueMm) - Number(b.valueMm))
        .map((t) => ({
          key: t.id,
          text: `${formatNumber(t.valueMm)} mm`,
          on: Number(filters.thicknessMm) === Number(t.valueMm),
          pick: () =>
            onChange({
              thicknessMm: Number(filters.thicknessMm) === Number(t.valueMm) ? undefined : Number(t.valueMm),
            }),
        })),
    },
    {
      label: 'Ebat',
      items: (sizes ?? []).map((z) => ({
        key: z.id,
        text: `${Number(z.widthMm)}×${Number(z.heightMm)}`,
        on: filters.sizeId === z.id,
        pick: () => onChange({ sizeId: filters.sizeId === z.id ? undefined : z.id }),
      })),
    },
    {
      // Renk kaydına (ad + kod) göre: Beyaz 1001 ile Beyaz 2002 ayrı süzülür.
      // Marka seçiliyse yalnız o markanın ve genel renkler.
      label: 'Renk',
      items: (colors ?? [])
        .filter((c) => !brandId || !c.brandId || c.brandId === brandId)
        .map((c) => ({
          key: c.id,
          text: c.code ? `${c.name} ${c.code}` : c.name,
          on: filters.colorId === c.id,
          pick: () => onChange({ colorId: filters.colorId === c.id ? undefined : c.id, color: undefined }),
        })),
    },
  ].filter((r) => r.items.length > 0);
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-2">
          <span className="w-16 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {r.label}
          </span>
          <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible">
            {r.items.map((it) => (
              <button key={it.key} type="button" aria-pressed={it.on} className={chip(it.on)} onClick={it.pick}>
                {it.text}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Toplu ekleme raporunda katalog türlerinin Türkçe adı. */
const AUTO_LABEL: Record<string, string> = {
  categories: 'ürün türü',
  brands: 'marka',
  colors: 'renk',
  sizes: 'ebat',
  thicknesses: 'kalınlık',
  templates: 'şablon',
};

function NewPlateForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreatePlateInput>(() => ({
    templateId: '',
    quantityInStock: 1,
    addedAt: todayISO(),
  }));
  const [skuTouched, setSkuTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [owner, setOwner] = useState<'business' | 'customer'>('business');
  const [picking, setPicking] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // Form açılınca ilk alana (ürün türü araması) odaklan — yalnız fareli
  // ekranlarda; telefonda klavye ve liste kendiliğinden açılıp ekranı kaplamasın.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) {
      rootRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, []);

  const { data: templates } = useMaterialTemplates();
  const { data: warehouses } = useWarehouses();

  const tpl = templates?.find((t) => t.id === form.templateId);
  const std = tpl?.defaultSize;
  const isArea = (form.measurementType ?? tpl?.measurementType) === 'area';
  const isLength = (form.measurementType ?? tpl?.measurementType) === 'length';
  const suggestedSku = tpl ? buildSku(tpl) : '';
  // Otomatik ad: şablonun GÜNCEL özelliklerinden CANLI türetilir (SKU gibi).
  // Böylece kataloğa yeni marka/renk/ebat eklenip şablon güncellenince ad da
  // yeniden seçim gerekmeden tazelenir.
  const suggestedName = tpl
    ? buildCatalogName(
        tpl.category?.name,
        tpl.defaultBrand,
        tpl.defaultColor,
        tpl.defaultSize,
        tpl.defaultThickness,
      )
    : '';

  const overSheet =
    isArea &&
    !!std &&
    ((form.widthMm != null && Number(form.widthMm) > Number(std.widthMm)) ||
      (form.heightMm != null && Number(form.heightMm) > Number(std.heightMm)));
  const m2 = isArea ? areaM2(form.widthMm, form.heightMm) : null;

  // #4 Tekli giriş kolaylığı: aynı özellikte N AYRI plaka kaydı (her biri 1 adet)
  // tek seferde oluşturulur; listede toplu/grupla görüntülenebilir.
  const [copies, setCopies] = useState(1);

  // #çoklu-giriş: kalemler önce bir ÖN ONAY listesine eklenir, hepsi birden
  // tek istekte kaydedilir. Böylece birden fazla farklı malzeme girilirken
  // ne kaydedileceği kaydetmeden önce görülür.
  const [drafts, setDrafts] = useState<
    { item: BatchPlateItem; label: string; detail: string }[]
  >([]);

  const batchMut = useMutation({
    mutationFn: () => createPlatesBatch(drafts.map((d) => d.item)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['material-templates'] });
      // Adla verilen tür/marka/renk/ebat/kalınlık kayıtları kendiliğinden
      // açılmış olabilir: katalog listeleri de tazelensin.
      qc.invalidateQueries({ queryKey: ['material-categories'] });
      qc.invalidateQueries({ queryKey: ['material-brands'] });
      qc.invalidateQueries({ queryKey: ['material-colors'] });
      qc.invalidateQueries({ queryKey: ['material-sizes'] });
      qc.invalidateQueries({ queryKey: ['material-thicknesses'] });
      setDrafts([]);
    },
  });

  const createMut = useMutation({
    mutationFn: async (input: CreatePlateInput) => {
      const n = Math.max(1, Math.floor(copies) || 1);
      for (let k = 0; k < n; k++) {
        await createPlate({ ...input, quantityInStock: input.quantityInStock ?? 1 });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      onClose();
    },
  });

  // Ürün türü seçilince özellikler (varyant/standart ebat) türden miras alınır.
  // Ad ve SKU canlı türetildiği için burada SABİTLENMEZ (yeniden seçim gerekmez).
  const applyTemplateDefaults = (templateId: string) => {
    const t = templates?.find((x) => x.id === templateId);
    setSkuTouched(false);
    setNameTouched(false);
    setForm((f) => ({
      ...f,
      templateId,
      measurementType: t?.measurementType,
      variant: t?.defaultVariant,
      widthMm: t?.defaultSize?.widthMm,
      heightMm: t?.defaultSize?.heightMm,
      name: undefined,
    }));
  };

  /** Formdaki değerleri ön onay listesine ekler (kayıt YAPMAZ). */
  const addToDrafts = () => {
    const item: BatchPlateItem = {
      ...form,
      name: (nameTouched ? form.name : suggestedName) || undefined,
      sku: skuTouched ? form.sku : undefined,
      copies: Math.max(1, Math.floor(copies) || 1),
    };
    const label =
      item.name ?? suggestedName ?? tpl?.name ?? 'Malzeme';
    const parts = [
      tpl?.category?.name,
      isArea && form.widthMm && form.heightMm
        ? `${form.widthMm}×${form.heightMm} mm`
        : '',
      `${form.quantityInStock ?? 1} adet`,
      (item.copies ?? 1) > 1 ? `${item.copies} ayrı kayıt` : '',
      owner === 'customer' ? 'müşteri malı' : 'işletme stoğu',
      form.retailPrice ? `perakende ${form.retailPrice}` : '',
    ].filter(Boolean);
    setDrafts((d) => [...d, { item, label, detail: parts.join(' · ') }]);
    // Sonraki kalem için miktar/ebat sıfırlanmaz — genelde benzer kalemler
    // arka arkaya girilir; yalnızca sayaç 1'e döner.
    setCopies(1);
  };

  const canSubmit =
    !!form.templateId &&
    !overSheet &&
    !(owner === 'customer' && !form.ownerCustomerId) &&
    !createMut.isPending;

  return (
    <div ref={rootRef} className="card space-y-3">
      <h2 className="font-semibold">Yeni stok kalemi</h2>
      {createMut.error && (
        <p className="text-sm text-red-600">
          {errMessage(createMut.error, 'Stok kalemi oluşturulamadı.')}
        </p>
      )}

      {/* <label> değil: içindeki düğmeye tıklayınca tarayıcı tıklamayı
          yeniden çizilen ilk düğmeye ("Değiştir") aktarıyordu. */}
      <div className="min-w-0">
        <span className="label">
          Ürün türü<span className="ml-0.5 text-red-600">*</span>
        </span>
        {/* Seçilince özet kart; değiştirmek için bulucu yeniden açılır. */}
        {tpl && !picking ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-900/20">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {stripNamePlaceholders(tpl.name) || tpl.name}
              </span>
              <span className="block truncate text-xs text-slate-500">{tpl.category?.name}</span>
            </span>
            <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setPicking(true)}>
              Değiştir
            </button>
          </div>
        ) : (
          <TemplateFinder
            templates={templates ?? []}
            selectedId={form.templateId}
            onPick={(id) => {
              applyTemplateDefaults(id);
              setPicking(false);
            }}
          />
        )}
      </div>

      {tpl && (
        <>
          {/* Türden gelen, okunur özellikler (formda düzenlenmez). */}
          <div className="space-y-0.5 rounded-xl bg-slate-50 p-2 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Türden gelen özellikler</p>
            <p>
              Marka: {tpl.defaultBrand?.name ?? '—'} · Renk:{' '}
              {tpl.defaultColor?.name ?? '—'}
              {tpl.defaultColor?.code ? ` (${tpl.defaultColor.code})` : ''}
            </p>
            <p>
              Kalınlık: {tpl.defaultThickness ? `${tpl.defaultThickness.valueMm} mm` : '—'} ·
              Standart tabaka: {std ? `${std.widthMm}×${std.heightMm} mm` : '—'}
            </p>
          </div>

          <Field label="Ad (otomatik oluşur, düzenleyebilirsiniz)">
            <input
              className="input"
              placeholder="Otomatik oluşturulur"
              value={nameTouched ? form.name ?? '' : suggestedName}
              onChange={(e) => {
                setNameTouched(true);
                setForm({ ...form, name: e.target.value || undefined });
              }}
            />
          </Field>

          <Field
            label="Stok kodu / SKU"
            hint="Boş bırakılırsa türden otomatik üretilir."
          >
            <input
              className="input"
              placeholder={suggestedSku || 'Otomatik oluşturulur'}
              value={skuTouched ? form.sku ?? '' : suggestedSku}
              onChange={(e) => {
                setSkuTouched(true);
                setForm({ ...form, sku: e.target.value || undefined });
              }}
            />
          </Field>

          <Field label="Tür/Varyant (örn. Dökme / Çekme)">
            <input
              className="input"
              value={form.variant ?? ''}
              onChange={(e) => setForm({ ...form, variant: e.target.value || undefined })}
            />
          </Field>

          {isArea && (
            <Field
              label="Kalan ebat (en × boy, mm)"
              hint={
                std
                  ? `Bu parçanın güncel/kesilmiş ebadı. Standart tabaka: ${std.widthMm}×${std.heightMm} mm.`
                  : 'Bu parçanın güncel/kesilmiş ebadı.'
              }
            >
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="En (mm)"
                    value={form.widthMm ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        widthMm: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Boy (mm)"
                    value={form.heightMm ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        heightMm: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                {overSheet ? (
                  <p className="text-xs text-red-600">
                    Kalan ebat standart tabaka ebadını ({std?.widthMm}×{std?.heightMm} mm)
                    aşamaz.
                  </p>
                ) : m2 != null ? (
                  <p className="text-xs text-slate-500">≈ {m2.toFixed(3)} m²</p>
                ) : null}
              </div>
            </Field>
          )}

          {/* Metre (rulo/şerit) malzemede yükseklik + uzunluk girişi. */}
          {isLength && (
            <Field
              label="Rulo/şerit ölçüsü (yükseklik × uzunluk)"
              hint="Yükseklik mm cinsinden; uzunluk metre cinsinden stok miktarı olarak tutulur."
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Yükseklik (mm)"
                  value={form.heightMm ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      heightMm: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Uzunluk (metre)"
                  value={form.quantityInStock ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      quantityInStock: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </Field>
          )}

          {/* 📐 cm/mm çevirici — ölçü girerken hızlı çevrim için. */}
          <UnitConverter />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Eklenme tarihi">
              <input
                className="input"
                type="date"
                value={form.addedAt ?? ''}
                onChange={(e) => setForm({ ...form, addedAt: e.target.value || undefined })}
              />
            </Field>
            <Field label="İşlenme tarihi (varsa)">
              <input
                className="input"
                type="date"
                value={form.processedAt ?? ''}
                onChange={(e) =>
                  setForm({ ...form, processedAt: e.target.value || undefined })
                }
              />
            </Field>
          </div>

          <Field label="Sahiplik">
            <select
              className="input"
              value={owner}
              onChange={(e) => {
                const v = e.target.value as 'business' | 'customer';
                setOwner(v);
                if (v === 'business') setForm({ ...form, ownerCustomerId: undefined });
              }}
            >
              <option value="business">İşletmeye ait (işletme stoğu)</option>
              <option value="customer">Müşteriye ait (konsinye)</option>
            </select>
          </Field>

          {owner === 'customer' && (
            <Field label="Sahip müşteri (ara)" required hint="Sahibini aratıp seçin. Sahipliği sonradan işletmeye aktarabilirsiniz.">
              <CustomerPicker
                placeholder="Sahip müşteriyi arayın…"
                onChange={(id) => setForm({ ...form, ownerCustomerId: id || undefined })}
              />
            </Field>
          )}

          <Field label="Depo">
            <select
              className="input"
              value={form.warehouseId ?? ''}
              onChange={(e) =>
                setForm({ ...form, warehouseId: e.target.value || undefined })
              }
            >
              <option value="">Varsayılan (Merkez) depo</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {tpl && (
        <Field
          label="Kaç ayrı plaka oluşturulsun?"
          hint="Her biri ayrı kayıt (kendi kalan ebadıyla) olarak oluşturulur; listede toplu/grupla görüntülenir."
        >
          <input
            className="input w-28"
            type="number"
            inputMode="numeric"
            min={1}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      )}

      {tpl && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Perakende (liste) fiyatı"
            hint="Satış fiyatı bunun üzerine kâr yüzdesi eklenerek önerilir. Birim: m² / metre / adet."
          >
            <div className="flex gap-2">
              <input
                className="input min-w-0 flex-1"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.retailPrice ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    retailPrice: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <select
                className="input w-24 shrink-0"
                value={form.retailCurrency ?? 'TRY'}
                onChange={(e) =>
                  setForm({ ...form, retailCurrency: e.target.value })
                }
              >
                {RETAIL_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field
            label="Bu malzemeye özel kâr yüzdesi (opsiyonel)"
            hint="Boş bırakılırsa Ayarlar'daki genel kâr yüzdesi geçerlidir."
          >
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={form.markupPercent ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  markupPercent: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </Field>
        </div>
      )}

      {/* ── Ön onay listesi: birden çok kalem tek seferde kaydedilir ── */}
      {drafts.length > 0 && (
        <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Kaydedilecek kalemler ({drafts.length})
          </p>
          <ul className="divide-y divide-emerald-200 rounded-lg bg-white text-sm dark:divide-emerald-800 dark:bg-slate-900">
            {drafts.map((d, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                <span className="shrink-0 rounded-full bg-slate-200 px-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {stripNamePlaceholders(d.label) || d.label}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {d.detail}
                  </span>
                </span>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                  title="Listeden çıkar"
                  aria-label={`${d.label} — listeden çıkar`}
                  onClick={() => setDrafts((x) => x.filter((_, k) => k !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {batchMut.isError && (
            <p className="text-sm text-red-700">
              {errMessage(batchMut.error, 'Kalemler kaydedilemedi.')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-success"
              disabled={batchMut.isPending}
              onClick={() => batchMut.mutate()}
            >
              {batchMut.isPending
                ? 'Kaydediliyor…'
                : `✅ Hepsini kaydet (${drafts.length})`}
            </button>
            <button
              className="btn-secondary"
              disabled={batchMut.isPending}
              onClick={async () => {
                // Birden çok kalem girildiyse yanlışlıkla silinmesin.
                if (
                  drafts.length > 1 &&
                  !(await confirmDialog({
                    message: `Kaydedilmemiş ${drafts.length} kalem listeden kaldırılsın mı?`,
                    confirmText: 'Listeyi temizle',
                    danger: true,
                  }))
                )
                  return;
                setDrafts([]);
              }}
            >
              Listeyi temizle
            </button>
          </div>
        </div>
      )}

      {batchMut.isSuccess && batchMut.data && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">
          ✅ {batchMut.data.created} stok kalemi eklendi.
          {Object.entries(batchMut.data.autoCreated)
            .filter(([, list]) => list.length > 0)
            .map(([kind, list]) => (
              <span key={kind} className="mt-1 block text-xs">
                Otomatik açılan {AUTO_LABEL[kind] ?? kind}: {list.join(', ')}
              </span>
            ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button
          className="btn-secondary"
          disabled={!canSubmit}
          title="Bu kalemi listeye ekle; kayıt, hepsini birden onayladığında yapılır"
          onClick={addToDrafts}
        >
          ➕ Listeye ekle
        </button>
        <button
          className="btn-primary"
          disabled={!canSubmit}
          onClick={() =>
            // Ad'a dokunulmadıysa otomatik (tür önekli) adı KALICI gönder —
            // böylece stoğa eklenen ürünün başına türü otomatik eklenir.
            // SKU OTOMATİK DOLDURULMAZ: benzersiz olmak zorunda (aynı türden
            // birden çok plakada/kopyada çakışıp hata veriyordu); yalnızca elle
            // girilirse gönderilir, boşsa null kalır.
            createMut.mutate({
              ...form,
              name: (nameTouched ? form.name : suggestedName) || undefined,
              sku: skuTouched ? form.sku : undefined,
            })
          }
        >
          {createMut.isPending
            ? 'Kaydediliyor…'
            : copies > 1
              ? `${copies} plaka oluştur`
              : 'Kaydet'}
        </button>
        <button className="btn-secondary" onClick={onClose}>
          İptal
        </button>
      </div>
    </div>
  );
}

/**
 * Perakende (liste) satış fiyatı — satış birim fiyatı bunun üzerine kâr
 * yüzdesi eklenerek hesaplanır. TRY, USD veya EUR girilebilir; hesaplar baz
 * para biriminde yapılır.
 */
function RetailPriceSection({ plate }: { plate: Plate }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['plate-pricing', plate.id],
    queryFn: () => fetchPlatePricing(plate.id),
  });
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<RetailCurrency>('TRY');
  const [markup, setMarkup] = useState('');
  useEffect(() => {
    if (data) {
      setPrice(data.retailPrice != null ? String(data.retailPrice) : '');
      setCurrency((data.retailCurrency as RetailCurrency) ?? 'TRY');
      setMarkup(data.markupPercent ? String(data.markupPercent) : '');
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      setPlateRetailPrice(plate.id, {
        retailPrice: Number(price.replace(',', '.')) || 0,
        currency,
        ...(markup.trim() ? { markupPercent: Number(markup) } : {}),
      }),
    onSuccess: () => {
      // Toplu fiyat listeleri (seçiciler) de bu kalemi içerebilir.
      qc.invalidateQueries({ queryKey: ['plate-pricing'] });
      qc.invalidateQueries({ queryKey: ['retail-suggestions'] });
      qc.invalidateQueries({ queryKey: ['price-rules'] });
    },
  });

  const clearMut = useMutation({
    mutationFn: () => clearPlateRetailPrice(plate.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plate-pricing'] });
      qc.invalidateQueries({ queryKey: ['retail-suggestions'] });
      qc.invalidateQueries({ queryKey: ['price-rules'] });
    },
  });

  const unitLabel =
    plate.measurementType === 'length'
      ? 'metre'
      : plate.measurementType === 'weight'
        ? 'kg'
        : plate.measurementType === 'piece'
          ? 'adet'
          : 'm²';
  const rule = data?.rule;

  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-sm dark:border-indigo-900 dark:bg-indigo-900/20">
      <p className="font-medium text-indigo-800 dark:text-indigo-300">
        💰 Perakende (satış) fiyatı — {unitLabel} başına
      </p>
      {/* Satın almalardan alış maliyeti: önerilen fiyattaki kâr. */}
      {data?.cost?.unitCost != null && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          💹 <span className="font-semibold">Son alış:</span>{' '}
          {formatMoney(data.cost.purchaseUnitPrice, data.cost.currency)}/
          {plate.measurementType === 'area' ? 'tabaka' : unitLabel} ({formatDate(data.cost.purchaseDate)}
          {data.cost.supplierName ? `, ${data.cost.supplierName}` : ''}
          {data.cost.source === 'template' ? ', aynı ürün türü' : ''}) ≈{' '}
          {formatMoney(data.cost.unitCost, data.baseCurrency)}/{unitLabel}
          {data.marginPercent != null && (
            <span
              className={`ml-2 rounded-full px-2 py-0.5 font-semibold ${
                data.marginPercent < 0
                  ? 'bg-red-100 text-red-700'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}
            >
              önerilen fiyatta {data.marginPercent < 0 ? 'zarar' : 'kâr'} %{formatNumber(Math.abs(data.marginPercent), 1)}
            </span>
          )}
        </p>
      )}
      {/* Kaleme uyan fiyat çatısı: kalemin kendi fiyatı yoksa öneri buradan. */}
      {rule && (
        <div className="space-y-1 rounded-md bg-white/70 p-2 text-xs dark:bg-slate-900/40">
          <p>
            <span className="font-semibold">Fiyat çatısı:</span> {rule.label} —{' '}
            {rule.supplierName ?? 'kendi liste fiyatı'} {formatMoney(rule.price, rule.currency)}
            {rule.unitPriceBase != null && rule.unit !== 'per_m2' && plate.measurementType === 'area' && (
              <> (≈ {formatMoney(rule.unitPriceBase, data.baseCurrency)}/m²)</>
            )}
            {rule.unitPriceBase != null && rule.currency !== data.baseCurrency && rule.unit === 'per_m2' && (
              <> (≈ {formatMoney(rule.unitPriceBase, data.baseCurrency)})</>
            )}
          </p>
          {data.priceSource === 'plate' ? (
            <p className="flex flex-wrap items-center gap-2 text-amber-800 dark:text-amber-300">
              Bu kalemin kendi fiyatı var; çatı fiyatı kullanılmıyor.
              <button
                type="button"
                className="font-semibold text-indigo-700 underline dark:text-indigo-300"
                disabled={clearMut.isPending}
                onClick={() => clearMut.mutate()}
              >
                Kalem fiyatını kaldır, çatıyı kullan
              </button>
            </p>
          ) : (
            <p className="text-slate-500">
              Satış fiyatı bu çatıdan önerilir. Yalnız bu kaleme özel fiyat isterseniz aşağıya yazın.
            </p>
          )}
          <Link to="/price-rules" className="font-medium text-indigo-700 underline dark:text-indigo-300">
            Fiyat çatılarını aç
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs">
          <span className="label">Perakende fiyat</span>
          <input
            className="input w-28"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="block text-xs">
          <span className="label">Para birimi</span>
          <select
            className="input w-24"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as RetailCurrency)}
          >
            {RETAIL_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="label">Kâr % (boş = genel)</span>
          <input
            className="input w-24"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
          />
        </label>
        <button
          className="btn bg-indigo-600 text-white hover:bg-indigo-700"
          disabled={!price.trim() || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>

      {data?.suggestedUnitPrice != null && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Önerilen satış fiyatı:{' '}
          <b>{formatMoney(data.suggestedUnitPrice, data.baseCurrency)}</b>{' '}
          / {unitLabel}
          {data.discountPercent != null && (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
              piyasadan %{data.discountPercent} uygun
            </span>
          )}
        </p>
      )}
      {(mut.isError || clearMut.isError) && (
        <p className="text-xs text-red-600">
          {errMessage(mut.error ?? clearMut.error, 'Fiyat kaydedilemedi.')}
        </p>
      )}
    </div>
  );
}

const PRICE_UNIT_LABELS: Record<SupplierPriceUnit, string> = {
  per_plate: 'Plaka/adet',
  per_m2: 'm²',
  per_meter: 'metre',
  per_kg: 'kg',
};

/** 💰 Tedarikçi fiyatları: bu plaka için tedarikçi bazlı alış fiyatı yönet. */
function PlatePricesSection({ plate }: { plate: Plate }) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<SupplierPriceUnit>(
    plate.measurementType === 'length'
      ? 'per_meter'
      : plate.measurementType === 'weight'
        ? 'per_kg'
        : 'per_plate',
  );

  const { data: prices } = useQuery({
    queryKey: ['plate-prices', plate.id],
    queryFn: () => fetchPlatePrices(plate.id),
  });
  const { data: suppliers } = useSuppliers();
  // Malzemeci fiyatı piyasa karşılaştırmasına ve fiyat önerisine de girer.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['plate-prices', plate.id] });
    qc.invalidateQueries({ queryKey: ['plate-pricing'] });
    qc.invalidateQueries({ queryKey: ['price-compare', plate.id] });
  };

  const upsertMut = useMutation({
    mutationFn: () =>
      upsertPlatePrice(plate.id, {
        supplierId,
        price: Number(price),
        unit,
      }),
    onSuccess: () => {
      invalidate();
      setPrice('');
    },
  });
  const delMut = useMutation({
    mutationFn: (priceId: string) => deletePlatePrice(plate.id, priceId),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">
      <p className="font-medium text-slate-700 dark:text-slate-200">
        💰 Tedarikçi fiyatları
      </p>
      {(upsertMut.isError || delMut.isError) && (
        <p className="text-xs text-red-600">
          {errMessage(upsertMut.error ?? delMut.error, 'İşlem başarısız.')}
        </p>
      )}
      {prices?.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1 first:border-0 first:pt-0 dark:border-slate-700"
        >
          <span className="min-w-0">
            {row.supplier?.name ?? '—'} ·{' '}
            <span className="font-semibold">{formatMoney(row.price, row.currency)}</span>{' '}
            / {PRICE_UNIT_LABELS[row.unit] ?? row.unit}
            {row.priceUpdatedAt && (
              <span className="ml-1 text-xs text-slate-400">
                ({formatDate(row.priceUpdatedAt)})
              </span>
            )}
          </span>
          <button
            className="btn-danger-soft btn-sm shrink-0"
            disabled={delMut.isPending}
            onClick={async () => {
              if (
                await confirmDialog({
                  message: `${row.supplier?.name ?? 'Tedarikçi'} fiyatı silinsin mi?`,
                  confirmText: 'Sil',
                })
              )
                delMut.mutate(row.id);
            }}
          >
            Sil
          </button>
        </div>
      ))}
      {!prices?.length && (
        <p className="text-xs text-slate-400">Henüz tedarikçi fiyatı yok.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input min-w-0 basis-full sm:basis-auto sm:flex-1"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">Tedarikçi seç…</option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className="input w-28"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="Fiyat"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <select
          className="input w-auto"
          value={unit}
          onChange={(e) => setUnit(e.target.value as SupplierPriceUnit)}
        >
          {Object.entries(PRICE_UNIT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          className="btn bg-slate-800 text-white hover:bg-slate-700"
          disabled={!supplierId || price === '' || upsertMut.isPending}
          onClick={() => upsertMut.mutate()}
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}

/** İşlenmiş/kesilmiş bir plakanın kalan ebat, tarih ve sahiplik bilgisini düzenler. */
function EditPlateForm({ plate, onClose }: { plate: Plate; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdatePlateInput>({
    name: plate.name,
    sku: plate.sku,
    variant: plate.variant,
    widthMm: plate.widthMm,
    heightMm: plate.heightMm,
    addedAt: plate.addedAt,
    processedAt: plate.processedAt,
  });

  const { data: templates } = useMaterialTemplates();
  const { data: levels } = useQuery({
    queryKey: ['plate-stock-levels', plate.id],
    queryFn: () => fetchPlateStockLevels(plate.id),
  });

  const tpl = templates?.find((t) => t.id === plate.templateId);
  const std = tpl?.defaultSize;
  const isArea = plate.measurementType === 'area';
  const overSheet =
    isArea &&
    !!std &&
    ((form.widthMm != null && Number(form.widthMm) > Number(std.widthMm)) ||
      (form.heightMm != null && Number(form.heightMm) > Number(std.heightMm)));

  // Seviye → aktarım hedefi ('business' | '' (müşteri seçilmedi) | müşteri id).
  const [targets, setTargets] = useState<Record<string, string>>({});
  // Seçicide seçilen müşterilerin adları (aktarımdan hemen sonra liste
  // tazelenene kadar yeni sahibin adı görünsün).
  const [knownNames, setKnownNames] = useState<Record<string, string>>({});

  const updateMut = useMutation({
    mutationFn: (input: UpdatePlateInput) => updatePlate(plate.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      onClose();
    },
  });
  const transferMut = useMutation({
    mutationFn: (input: TransferOwnershipInput) => transferPlateOwnership(plate.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['plate-stock-levels', plate.id] });
    },
  });
  const depleteMut = useMutation({
    mutationFn: () => depletePlate(plate.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      onClose();
    },
  });

  // Sahip adı plakanın kendi verisinden (liste her kalemin konsinye
  // sahiplerini kimlik + adla taşır); tüm müşteri listesi çekilmez.
  const customerName = (id?: string | null) =>
    (id && (plate.ownerCustomers?.find((c) => c.id === id)?.name ?? knownNames[id])) || 'Müşteri';
  const activeLevels = (levels ?? []).filter((l) => Number(l.quantity) > 0);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3">
      {updateMut.error && (
        <p className="text-sm text-red-600">
          {errMessage(updateMut.error, 'Güncellenemedi.')}
        </p>
      )}
      {transferMut.error && (
        <p className="text-sm text-red-600">
          {errMessage(transferMut.error, 'Sahiplik aktarılamadı.')}
        </p>
      )}

      <Field label="Ad">
        <input
          className="input"
          value={form.name ?? ''}
          onChange={(e) => setForm({ ...form, name: e.target.value || undefined })}
        />
      </Field>
      <Field label="Stok kodu / SKU">
        <input
          className="input"
          value={form.sku ?? ''}
          onChange={(e) => setForm({ ...form, sku: e.target.value || undefined })}
        />
      </Field>
      <Field label="Tür/Varyant">
        <input
          className="input"
          value={form.variant ?? ''}
          onChange={(e) => setForm({ ...form, variant: e.target.value || undefined })}
        />
      </Field>

      {isArea && (
        <Field
          label="Kalan ebat (en × boy, mm)"
          hint={
            std
              ? `İşlem sonrası güncel ebat. Standart tabaka: ${std.widthMm}×${std.heightMm} mm.`
              : 'İşlem sonrası güncel ebat.'
          }
        >
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="En (mm)"
                value={form.widthMm ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    widthMm: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Boy (mm)"
                value={form.heightMm ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    heightMm: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
            {overSheet && (
              <p className="text-xs text-red-600">
                Kalan ebat standart tabaka ebadını ({std?.widthMm}×{std?.heightMm} mm) aşamaz.
              </p>
            )}
          </div>
        </Field>
      )}

      {/* Metre (rulo/şerit) malzemede yükseklik düzenlenebilir; uzunluk stok
          hareketleriyle (satış/işleme) yönetilir. */}
      {plate.measurementType === 'length' && (
        <Field
          label="Yükseklik (mm)"
          hint={`Mevcut uzunluk: ${Number(plate.quantityInStock)} m (stok hareketleriyle değişir).`}
        >
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Yükseklik (mm)"
            value={form.heightMm ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                heightMm: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </Field>
      )}

      {/* 📐 cm/mm çevirici — ölçü girerken hızlı çevrim için. */}
      <UnitConverter />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Eklenme tarihi">
          <input
            className="input"
            type="date"
            value={form.addedAt ?? ''}
            onChange={(e) => setForm({ ...form, addedAt: e.target.value || undefined })}
          />
        </Field>
        <Field label="İşlenme tarihi">
          <input
            className="input"
            type="date"
            value={form.processedAt ?? ''}
            onChange={(e) => setForm({ ...form, processedAt: e.target.value || undefined })}
          />
        </Field>
      </div>

      {/* 💰 Perakende (satış) fiyatı — satış fiyatı bundan türetilir. */}
      <RetailPriceSection plate={plate} />

      {/* 💰 Tedarikçi fiyatları — alım karşılaştırması buradan beslenir. */}
      <PlatePricesSection plate={plate} />

      {activeLevels.length > 0 && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2 text-sm">
          <p className="font-medium text-slate-700">Sahiplik / stok seviyeleri</p>
          {activeLevels.map((l) => {
            const fromLabel = l.ownerCustomerId
              ? customerName(l.ownerCustomerId)
              : 'İşletme';
            const target = targets[l.id] ?? 'business';
            return (
              <div
                key={l.id}
                className="space-y-1 border-t border-slate-200 pt-2 first:border-0 first:pt-0"
              >
                <div className="text-slate-700">
                  <span className="font-medium">{fromLabel}</span> ·{' '}
                  {formatNumber(l.quantity)} {qtyUnit(plate)} · {l.warehouse?.name ?? 'depo'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">aktar →</span>
                  <OwnerTargetPicker
                    value={target}
                    ariaLabel={`${fromLabel} stoğunu aktar: hedef sahip`}
                    onChange={(v, name) => {
                      setTargets((t) => ({ ...t, [l.id]: v }));
                      if (v && v !== 'business' && name) setKnownNames((n) => ({ ...n, [v]: name }));
                    }}
                  />
                  <button
                    className="btn-primary btn-sm"
                    disabled={
                      transferMut.isPending ||
                      target === '' ||
                      (target === 'business' && !l.ownerCustomerId) ||
                      target === l.ownerCustomerId
                    }
                    onClick={() =>
                      transferMut.mutate({
                        fromOwnerCustomerId: l.ownerCustomerId ?? undefined,
                        toOwnerCustomerId: target === 'business' ? undefined : target,
                        warehouseId: l.warehouseId,
                      })
                    }
                  >
                    Aktar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {depleteMut.error && (
        <p className="text-sm text-red-600">
          {errMessage(depleteMut.error, 'Stoktan çıkarılamadı.')}
        </p>
      )}

      {/* Kaydet / Kapat solda; geri alınamaz "stoktan çıkar" ayrık ve en sonda. */}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button
          className="btn-primary"
          disabled={overSheet || updateMut.isPending}
          onClick={() => updateMut.mutate(form)}
        >
          {updateMut.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button className="btn-secondary" onClick={onClose}>
          Kapat
        </button>
        <button
          className="btn-danger-soft sm:ml-auto"
          disabled={depleteMut.isPending}
          onClick={async () => {
            if (
              await confirmDialog({
                title: 'Stoktan çıkarılsın mı?',
                message: `"${displayPlateName(plate)}" tamamen satıldı/bitti olarak stoktan çıkarılsın mı? (geri alınamaz)`,
                confirmText: 'Stoktan çıkar',
                danger: true,
              })
            ) {
              depleteMut.mutate();
            }
          }}
        >
          Tamamını sat / stoktan çıkar
        </button>
      </div>
    </div>
  );
}

/**
 * Aktarım hedefi: işletme ya da aranarak seçilen bir müşteri. Tüm müşteri
 * listesini çekmez (müşteri ancak "Müşteriye" seçilip yazılınca aranır), bu
 * yüzden 100'den fazla müşterisi olan dükkânda da her müşteri seçilebilir.
 * Değer: 'business' · '' (müşteri henüz seçilmedi) · müşteri id.
 */
function OwnerTargetPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string, name?: string) => void;
  ariaLabel?: string;
}) {
  const mode = value === 'business' ? 'business' : 'customer';
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <select
        className="input min-w-0 sm:w-auto sm:flex-none"
        aria-label={ariaLabel}
        value={mode}
        onChange={(e) => onChange(e.target.value === 'business' ? 'business' : '')}
      >
        <option value="business">İşletme</option>
        <option value="customer">Müşteriye…</option>
      </select>
      {mode === 'customer' && (
        <div className="min-w-[12rem] flex-1">
          <CustomerPicker
            placeholder="Müşteri ara…"
            onChange={(id, name) => onChange(id, name)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Sahip rozeti: işletme stoğu sade gri, müşteriye ait (konsinye) mor — miktar
 * rozetinin yeşil/sarı/kırmızı anlamıyla karışmasın.
 */
function OwnerChip({ plate, className = '' }: { plate: Plate; className?: string }) {
  const owner = ownerLabel(plate);
  const consigned = !!plate.owners?.length && owner !== 'İşletme';
  return (
    <span
      className={`badge whitespace-normal break-words ${
        consigned
          ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200'
          : 'bg-slate-100 text-slate-700'
      } ${className}`}
      title={consigned ? 'Müşteriye ait (konsinye)' : 'İşletme stoğu'}
    >
      👤 {owner}
    </span>
  );
}

/** Başka dükkândan alınan kalem: hangi dükkândan (belgeye bağlantı). */
function OriginChip({ plate }: { plate: Plate }) {
  if (!plate.origin) return null;
  return (
    <Link
      to={`/shop-transfers?q=${encodeURIComponent(plate.origin.transferNo)}`}
      className="badge bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-200"
      title={`${plate.origin.transferNo} · ${formatDate(plate.origin.transferDate)} — kime satıldığını izlemek için açın`}
    >
      🏬 {plate.origin.fromShopName} dükkânından
    </Link>
  );
}

/** Başka dükkâna satış bağlantısı (birden çok dükkâna girebilen, satış yetkili kullanıcıya). */
function SellToShopLink({ plate }: { plate: Plate }) {
  const { can, shops } = useAuth();
  if (!can('sales', 'write') || shops.filter((s) => s.isActive).length < 2) return null;
  if (!(Number(plate.quantityInStock) > 0)) return null;
  return (
    <Link className="btn-secondary btn-sm" to={`/shop-transfers?plate=${plate.id}`} title="Bu malzemeyi başka bir dükkâna sat">
      🔁 Dükkâna sat
    </Link>
  );
}

/** Miktar rozeti: bitti kırmızı, az kaldı sarı, yeterli yeşil. */
function QtyBadge({ plate }: { plate: Plate }) {
  return (
    <span
      className={`badge shrink-0 font-semibold ${qtyBadgeClass(plate)}`}
      title={qtyBadgeTitle(plate)}
    >
      {formatNumber(plate.quantityInStock)} {qtyUnit(plate)}
    </span>
  );
}

/** Kesilmiş tabakada öne çıkan "✂ Kalan" rozeti metni. */
function remainingText(plate: Plate): string {
  const m2 = areaM2(plate.widthMm, plate.heightMm);
  return `✂ Kalan: ${Number(plate.widthMm)}×${Number(plate.heightMm)} mm${
    m2 != null ? ` · ${m2.toFixed(2)} m²` : ''
  }`;
}

/** Tek plaka kartı — temiz başlık, renkli miktar, sahip, okunur ölçü/tarih ve düzenleme. */
function PlateCard({ plate }: { plate: Plate }) {
  const [editing, setEditing] = useState(false);
  const partial = isPartialSheet(plate);
  const dims = plateDimsText(plate);
  // Marka · renk (kod) · varyant — eksik olanlar "—" yerine hiç yazılmaz.
  const specs = [
    plate.brand,
    plate.color ? (plate.colorCode ? `${plate.color} (${plate.colorCode})` : plate.color) : plate.colorCode,
    plate.variant,
  ].filter(Boolean);
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold leading-snug">
          {displayPlateName(plate)}
        </h3>
        <QtyBadge plate={plate} />
      </div>
      {(specs.length > 0 || plate.sku) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
          {specs.length > 0 && <span>{specs.join(' · ')}</span>}
          {plate.sku && (
            <span className="break-all font-mono text-xs text-slate-400" title="Stok kodu">
              {plate.sku}
            </span>
          )}
        </p>
      )}
      {/* Kesilmiş tabakada KALAN ebat ön planda ve okunaklı; tam tabakada sade. */}
      {partial ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-sm font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            {remainingText(plate)}
          </span>
          {plate.template?.defaultSize && (
            <span className="text-xs text-slate-400">
              Standart: {Number(plate.template.defaultSize.widthMm)}×
              {Number(plate.template.defaultSize.heightMm)} mm
            </span>
          )}
        </p>
      ) : (
        dims && <p className="mt-1 text-xs text-slate-500">📐 {dims}</p>
      )}
      {/* Sahip rozeti + stok/işlenme tarihi. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <OwnerChip plate={plate} />
        <OriginChip plate={plate} />
        {plate.addedAt && <span>Stok: {formatDate(plate.addedAt)}</span>}
        {plate.processedAt && <span>İşlendi: {formatDate(plate.processedAt)}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn-secondary btn-sm"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Kapat' : 'Düzenle'}
        </button>
        <SellToShopLink plate={plate} />
      </div>
      {editing && <EditPlateForm plate={plate} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** #4 Mini görünüm: tek satırda ad · kalan ebat · sahip · adet + düzenle. */
function PlateMiniRow({ plate }: { plate: Plate }) {
  const [editing, setEditing] = useState(false);
  const dims = plateDimsText(plate);
  return (
    <div className="bg-white px-3 py-2 text-sm dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words font-semibold">{displayPlateName(plate)}</span>
          {isPartialSheet(plate) ? (
            <span className="inline-block rounded bg-amber-100 px-1 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              {remainingText(plate)}
            </span>
          ) : (
            dims && <span className="text-xs text-slate-500">{dims}</span>
          )}
          <OwnerChip plate={plate} />
          <OriginChip plate={plate} />
        </div>
        <QtyBadge plate={plate} />
        <button
          className="btn-secondary btn-sm shrink-0"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Kapat' : 'Düzenle'}
        </button>
      </div>
      {editing && <EditPlateForm plate={plate} onClose={() => setEditing(false)} />}
    </div>
  );
}

/**
 * Toplu işlemler: yukarıdaki filtreye uyan malzemeler checkbox ile seçilip
 * (1) topluca SAHİPLİK AKTARILIR (kimden→kime; işletme↔müşteri) veya
 * (2) topluca STOKTAN ÇIKARILIR — çıkarmadan önce her ürün SAHİBİYLE birlikte
 * tek onay ekranında listelenir. Yalnızca İşletme Sahibi.
 */
function BulkOperations({
  filters,
  owners,
}: {
  filters: PlateFilters;
  /** Şu an stoğu olan konsinye sahipleri ("kimden" seçenekleri). */
  owners: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<null | 'transfer' | 'deplete'>(null);
  const [fromOwner, setFromOwner] = useState('');
  // Hedef: 'business' · '' (müşteri seçilmedi) · müşteri id.
  const [toOwner, setToOwner] = useState('business');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Filtreye uyan malzemeler (bulk için en fazla 100; ana listenin sayfalamasından bağımsız).
  const { data } = useQuery({
    queryKey: ['plates', 'bulk', filters],
    queryFn: () => fetchPlates({ ...filters, page: 1, limit: 100 }),
    enabled: open,
  });
  const plates = data?.items ?? [];
  const ownerOf = (p: Plate) => (p.owners?.length ? p.owners.join(', ') : 'İşletme');
  const selected = plates.filter((p) => sel.has(p.id));
  const allSel = plates.length > 0 && plates.every((p) => sel.has(p.id));

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSel(allSel ? new Set() : new Set(plates.map((p) => p.id)));

  // İstekler en çok 4'er 4'er gönderilir; sonuç ne olursa olsun liste tazelenir.
  const run = async (fn: (id: string) => Promise<unknown>, label: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const results = await mapLimit(selected, 4, (p) => fn(p.id));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      setMsg(`${ok} malzeme ${label}${fail ? `, ${fail} başarısız` : ''}.`);
    } finally {
      setBusy(false);
      setMode(null);
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ['plates'] });
    }
  };
  const toOwnerId = toOwner === 'business' ? '' : toOwner;
  const runTransfer = () =>
    run(
      (id) =>
        transferPlateOwnership(id, {
          fromOwnerCustomerId: fromOwner || undefined,
          toOwnerCustomerId: toOwnerId || undefined,
        }),
      'aktarıldı',
    );
  const runDeplete = () => run((id) => depletePlate(id), 'stoktan çıkarıldı');

  return (
    <div className="card space-y-2">
      <button
        type="button"
        className="flex min-h-[36px] w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-semibold">
          🔀 Toplu sahiplik aktar / stoktan çıkar
        </span>
        <span className="text-xs text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {open && (
        <>
          <p className="text-xs text-slate-500">
            Aşağıdaki liste, yukarıdaki filtrelere uyan malzemeleri gösterir (en
            fazla 100). Sahibe/türe göre süzüp seçin.
          </p>
          {plates.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={allSel} onChange={toggleAll} />
              Tümünü seç ({plates.length})
            </label>
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {plates.map((p) => (
              <label
                key={p.id}
                className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40"
              >
                <input
                  type="checkbox"
                  checked={sel.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span className="min-w-0 flex-1 truncate">{displayPlateName(p)}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${groupChipClass(
                    p.template?.category?.name ?? 'Diğer',
                  )}`}
                >
                  {p.template?.category?.name ?? 'Diğer'}
                </span>
                <span className="max-w-[35%] shrink-0 truncate text-xs text-slate-500">
                  👤 {ownerOf(p)}
                </span>
              </label>
            ))}
            {!plates.length && (
              <p className="py-2 text-xs text-slate-400">
                {data ? 'Filtreye uyan malzeme yok.' : 'Yükleniyor…'}
              </p>
            )}
          </div>

          {mode === null && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary btn-sm"
                disabled={sel.size === 0}
                onClick={() => {
                  setMode('transfer');
                  setMsg(null);
                }}
              >
                Sahiplik aktar ({sel.size})
              </button>
              <button
                className="btn-danger-soft btn-sm"
                disabled={sel.size === 0}
                onClick={() => {
                  setMode('deplete');
                  setMsg(null);
                }}
              >
                Stoktan çıkar ({sel.size})
              </button>
            </div>
          )}

          {mode === 'transfer' && (
            <div className="space-y-2 rounded-xl border border-slate-300 p-2 dark:border-slate-700">
              <p className="text-sm font-medium">
                Sahiplik aktar — {selected.length} malzeme
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="label">Kimden</span>
                  <select
                    className="input"
                    value={fromOwner}
                    onChange={(e) => setFromOwner(e.target.value)}
                  >
                    <option value="">İşletme</option>
                    {owners.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="block text-sm">
                  <span className="label">Kime</span>
                  <OwnerTargetPicker
                    value={toOwner}
                    ariaLabel="Hedef sahip"
                    onChange={(v) => setToOwner(v)}
                  />
                </div>
              </div>
              {fromOwner === toOwnerId && toOwner !== '' && (
                <p className="text-xs text-amber-600">
                  Kaynak ve hedef sahip aynı olamaz.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={busy || toOwner === '' || fromOwner === toOwnerId}
                  onClick={runTransfer}
                >
                  {busy ? 'Aktarılıyor…' : 'Aktar'}
                </button>
                <button className="btn-secondary" onClick={() => setMode(null)}>
                  İptal
                </button>
              </div>
            </div>
          )}

          {mode === 'deplete' && (
            <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-2 dark:border-red-700 dark:bg-red-900/20">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                Stoktan çıkarılacak {selected.length} malzeme — onaylayın
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">
                Bu işlem geri alınamaz; seçilen malzemelerin TÜM stoğu (konsinye
                dahil) sıfırlanır. Her ürün sahibiyle aşağıda listelenmiştir.
              </p>
              <ul className="max-h-56 divide-y divide-red-200 overflow-y-auto rounded-lg border border-red-200 bg-white text-sm dark:divide-red-800 dark:border-red-800 dark:bg-slate-900">
                {selected.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-2 py-1"
                  >
                    <span className="min-w-0 truncate">{displayPlateName(p)}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      👤 {ownerOf(p)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button className="btn-danger" disabled={busy} onClick={runDeplete}>
                  {busy ? 'İşleniyor…' : 'Onayla ve stoktan çıkar'}
                </button>
                <button className="btn-secondary" onClick={() => setMode(null)}>
                  İptal
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Aynı malzemenin tüm parçalarını tek satırda toplayan grup başlığı.
 *
 * Depoda bir malzemenin onlarca parçası olabiliyor; hepsi düz listede
 * göründüğünde ekran okunmuyordu. Başlıkta özet (kaç parça, toplam stok,
 * sahipler, kaçı kesilmiş) verilir; tıklanınca parçalar açılır.
 */
function MaterialGroupRow({
  label,
  plates,
  miniView,
}: {
  label: string;
  plates: Plate[];
  miniView: boolean;
}) {
  // Tek parçalı malzemede gizlemenin anlamı yok — doğrudan açık gelir.
  const [open, setOpen] = useState(plates.length === 1);

  const unit =
    plates[0]?.measurementType === 'length'
      ? 'm'
      : plates[0]?.measurementType === 'weight'
        ? 'kg'
        : 'adet';
  const totalQty = plates.reduce((n, p) => n + Number(p.quantityInStock || 0), 0);
  const partials = plates.filter((p) => isPartialSheet(p)).length;
  const owners = [
    ...new Set(
      plates.flatMap((p) => (p.owners?.length ? p.owners : ['İşletme'])),
    ),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="shrink-0 text-slate-400">
          {plates.length > 1 ? (open ? '▾' : '▸') : '•'}
        </span>
        <span className="min-w-0 flex-1">
          {/* Başlıktaki "—" yer tutucuları yalnız gösterimde temizlenir. */}
          <span className="block truncate text-sm font-semibold">
            {stripNamePlaceholders(label) || displayPlateName(plates[0])}
          </span>
          <span className="block truncate text-xs text-slate-500">
            👤 {owners.join(', ')}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-xs">
          {partials > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              ✂ {partials} parça
            </span>
          )}
          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {plates.length} kayıt
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              totalQty > 0
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}
          >
            {formatNumber(totalQty)} {unit}
          </span>
        </span>
      </button>

      {open && (
        <div className="p-2">
          {miniView ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {plates.map((plate) => (
                <PlateMiniRow key={plate.id} plate={plate} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plates.map((plate) => (
                <PlateCard key={plate.id} plate={plate} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Plaka (stok) listesi + gelişmiş filtreleme.
 * Mobil: tek sütun kartlar; masaüstü: çok sütunlu ızgara.
 * Hızlı arama bağlantıları: /plates?new=1 (yeni kalem formu), /plates?q=metin (arama).
 */
export function PlatesListPage() {
  const { can } = useAuth();
  // Sayfa başına kayıt (kalıcı) + sayfalama: tüm ürünler sayfalar hâlinde görünür.
  const [pageSize, setPageSize] = usePageSize('plates', 20);
  const [filters, setFilters] = useState<PlateFilters>({ page: 1, limit: pageSize });
  const changePageSize = (n: number) => {
    setPageSize(n);
    setFilters((f) => ({ ...f, limit: n, page: 1 }));
  };
  const [showForm, setShowForm] = useState(false);
  // Genel mini mod + gruplama ayarlarına uyar; sayfada geçici override edilebilir.
  const { mini: miniView, toggle: toggleMini } = useListDensity();
  const { grouped: groupByType, toggle: toggleGroup } = useListGrouping();

  const { data, isLoading } = useQuery({
    queryKey: ['plates', filters],
    queryFn: () => fetchPlates(filters),
    // Filtre/sayfa değişirken önceki liste kalır (iskelete dönüp titremez).
    placeholderData: keepPreviousData,
  });
  const { data: categories } = useMaterialCategories();
  // Sahip süzgeci: yalnız şu an stoğu olan konsinye sahipleri (tüm müşteri
  // listesi değil). ['plates', ...] altında: stok değişince tazelenir.
  const { data: owners } = useQuery({
    queryKey: ['plates', 'owners'],
    queryFn: fetchPlateOwners,
  });

  const set = (patch: Partial<PlateFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  // Arama kutusu: her harfte istek gitmesin diye yazma bitince (~300 ms)
  // filtreye yazılır.
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounced(searchText.trim());
  useEffect(() => {
    const next = debouncedSearch || undefined;
    setFilters((f) => (f.search === next ? f : { ...f, search: next, page: 1 }));
  }, [debouncedSearch]);

  // Hızlı aramadan gelen bağlantılar: ?new=1 formu açar (yazma izni varsa),
  // ?q=metin arama kutusunu doldurur ve listeyi süzer (beklemeden).
  useUrlParam('new', () => {
    if (can('stock', 'write')) setShowForm(true);
  });
  useUrlParam('q', (q) => {
    setSearchText(q);
    set({ search: q.trim() || undefined });
  });

  // Arama kutusu dışındaki etkin filtre sayısı (telefonda "Filtreler" rozetinde).
  const activeCount = [
    filters.categoryId,
    filters.brand,
    filters.color,
    filters.thicknessMm,
    filters.sizeId,
    filters.colorId,
    filters.owner || filters.ownerCustomerId,
    filters.inStock,
    filters.from || filters.to,
  ].filter(Boolean).length;
  const clearFilters = () =>
    set({
      categoryId: undefined,
      brand: undefined,
      color: undefined,
      thicknessMm: undefined,
      sizeId: undefined,
      colorId: undefined,
      owner: undefined,
      ownerCustomerId: undefined,
      inStock: undefined,
      from: undefined,
      to: undefined,
    });

  // Listeyi ÜRÜN TÜRÜNE, tür içinde de AYNI MALZEMEYE göre grupla. Aynı
  // malzemenin onlarca parçası tek satırda toplanır; açılınca parçalar görünür.
  const typeGroups = groupPlates(data?.items ?? []);

  return (
    <div className="space-y-4">
      <PageHeader
        icon="📦"
        title="Stok / Plakalar"
        subtitle="Plakalar, kesilmiş parçalar ve müşteriye ait (konsinye) malzemeler."
        actions={
          <>
            <Can module="catalog">
              <Link to="/material-templates" className="btn-secondary btn-sm">
                Ürün Türlerini Yönet
              </Link>
              <Link to="/material-categories" className="btn-secondary btn-sm">
                Türleri Yönet
              </Link>
            </Can>
            {!showForm && (
              <Can module="stock" level="write">
                <button
                  className="btn-primary"
                  data-hotkey="n"
                  title="Yeni stok kalemi (N)"
                  onClick={() => setShowForm(true)}
                >
                  + Yeni Stok Kalemi
                </button>
              </Can>
            )}
          </>
        }
      />

      {showForm && <NewPlateForm onClose={() => setShowForm(false)} />}

      {/* Filtreler — arama hep görünür; diğerleri telefonda "Filtreler" ardında. */}
      <Filters
        search={
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Ara: beyaz 2,8 akpolimer…"
            aria-label="Stokta ara"
          />
        }
        activeCount={activeCount}
        onClear={clearFilters}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block min-w-0">
            <span className="label">Tür</span>
            <select
              className="input"
              value={filters.categoryId ?? ''}
              onChange={(e) =>
                // Tür değişince önceki türün marka/kalınlık/ebat/renk seçimi geçersiz.
                set({
                  categoryId: e.target.value || undefined,
                  brand: undefined,
                  color: undefined,
                  thicknessMm: undefined,
                  sizeId: undefined,
                  colorId: undefined,
                })
              }
            >
              <option value="">Tüm türler</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {/* Tür seçiliyse marka/renk çiplerle (aşağıda) seçilir. */}
          {!filters.categoryId && (
            <>
              <label className="block min-w-0">
                <span className="label">Marka</span>
                <input
                  className="input"
                  placeholder="Marka"
                  value={filters.brand ?? ''}
                  onChange={(e) => set({ brand: e.target.value || undefined })}
                />
              </label>
              <label className="block min-w-0">
                <span className="label">Renk</span>
                <input
                  className="input"
                  placeholder="Renk"
                  value={filters.color ?? ''}
                  onChange={(e) => set({ color: e.target.value || undefined })}
                />
              </label>
            </>
          )}
          <label className="block min-w-0">
            <span className="label">Sahip</span>
            <select
              className="input"
              value={filters.ownerCustomerId ?? filters.owner ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') set({ owner: undefined, ownerCustomerId: undefined });
                else if (v === 'business') set({ owner: 'business', ownerCustomerId: undefined });
                else set({ owner: undefined, ownerCustomerId: v });
              }}
            >
              <option value="">Tüm sahipler</option>
              <option value="business">İşletme</option>
              {owners?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {filters.categoryId && (
          <CatalogFilterChips
            categoryId={filters.categoryId}
            filters={filters}
            onChange={set}
          />
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,36rem)_auto] lg:items-start">
          <DateRangeFilter
            value={{ from: filters.from, to: filters.to }}
            onChange={(r) => set({ from: r.from, to: r.to })}
            fromLabel="Stok tarihi (baş.)"
            toLabel="Stok tarihi (bit.)"
          />
          <label className="flex min-h-[44px] items-center gap-2 text-sm lg:mt-5">
            <input
              type="checkbox"
              checked={!!filters.inStock}
              onChange={(e) => set({ inStock: e.target.checked || undefined })}
            />
            Yalnız stokta olanlar
          </label>
        </div>
      </Filters>

      {/* Toplu sahiplik aktar / stoktan çıkar (stok yazma izni) — filtreye uyan
          malzemeler üzerinde çalışır. */}
      <Can module="stock" level="write">
        <BulkOperations filters={filters} owners={owners ?? []} />
      </Can>

      {/* Sonuç sayısı + görünüm ayarları (gruplama / mini). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {data?.meta ? `${formatNumber(data.meta.total, 0)} kayıt` : ''}
        </p>
        <div className="flex items-center gap-2">
          <GroupToggle grouped={groupByType} onToggle={toggleGroup} />
          <DensityToggle mini={miniView} onToggle={toggleMini} />
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock rows={4} />
      ) : !data?.items.length ? (
        activeCount > 0 || filters.search ? (
          <EmptyState
            icon="🔍"
            title="Aramaya / filtreye uyan stok kalemi yok"
            hint="Arama metnini kısaltmayı ya da filtreleri temizlemeyi deneyin."
            action={
              <button
                className="btn-secondary"
                onClick={() => {
                  clearFilters();
                  setSearchText('');
                  set({ search: undefined });
                }}
              >
                Aramayı ve filtreleri temizle
              </button>
            }
          />
        ) : (
          <EmptyState
            icon="📦"
            title="Henüz stok kalemi yok"
            hint="Plaka, rulo ya da adetli malzemeleri ekleyerek stok takibine başlayın. Stok kalemi, katalogdaki bir ürün türünden oluşturulur."
            action={
              can('stock', 'write') && !showForm ? (
                <button className="btn-primary" onClick={() => setShowForm(true)}>
                  + Yeni Stok Kalemi
                </button>
              ) : undefined
            }
          />
        )
      ) : groupByType ? (
        <div className="space-y-5">
          {typeGroups.map((g) => (
            <GroupSection
              key={g.category}
              title={g.category}
              count={g.count}
              countLabel="parça"
            >
              <div className="space-y-2">
                {g.materials.map((m) => (
                  <MaterialGroupRow
                    key={m.key}
                    label={m.label}
                    plates={m.plates}
                    miniView={miniView}
                  />
                ))}
              </div>
            </GroupSection>
          ))}
        </div>
      ) : miniView ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {data.items.map((plate) => (
            <PlateMiniRow key={plate.id} plate={plate} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((plate) => (
            <PlateCard key={plate.id} plate={plate} />
          ))}
        </div>
      )}

      {data?.meta && (
        <Pagination
          page={data.meta.page}
          pageCount={data.meta.pageCount}
          total={data.meta.total}
          pageSize={pageSize}
          onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
          onPageSize={changePageSize}
        />
      )}
    </div>
  );
}
