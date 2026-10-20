import { Can } from '../../components/Can';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createMaterialBrand,
  createMaterialColor,
  createMaterialSize,
  createMaterialTemplate,
  createMaterialThickness,
  deleteMaterialBrand,
  deleteMaterialColor,
  deleteMaterialSize,
  deleteMaterialTemplate,
  deleteMaterialThickness,
  fetchMaterialBrands,
  fetchMaterialColors,
  fetchMaterialSizes,
  fetchMaterialThicknesses,
  updateMaterialBrand,
  updateMaterialColor,
  updateMaterialSize,
  updateMaterialTemplate,
  updateMaterialThickness,
  mergeMaterialTemplates,
  type MaterialTemplateInput,
} from '../../api/materials.api';
import { FacetChips, useFacets } from '../../components/ui/FacetChips';
import {
  duplicateTemplateGroups,
  TEMPLATE_FACETS,
  templateKey,
  templateSearchText,
} from '../../lib/catalogKey';
import { matchesSearch } from '../../lib/search';
import { GroupSection } from '../../components/GroupSection';
import { ColorPicker } from '../../components/ColorPicker';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { Filters } from '../../components/ui/Filters';
import { SearchInput } from '../../components/ui/SearchInput';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useUrlParam } from '../../hooks/useUrlParam';
import { useAuth } from '../../context/AuthContext';
import { stripNamePlaceholders } from '../../lib/plateLabel';
import type {
  MaterialMeasurementType,
  MaterialTemplate,
  MeasurementType,
} from '../../types';
import { useMaterialCategories, useMaterialTemplates } from '../../hooks/useReferenceData';

const MEASUREMENT_LABELS: Record<MaterialMeasurementType, string> = {
  area: 'Alan (m²)',
  length: 'Uzunluk (metre)',
  piece: 'Adet',
  weight: 'Ağırlık (kg)',
};

const EMPTY: MaterialTemplateInput = {
  name: '',
  categoryId: '',
  measurementType: 'area',
  isActive: true,
};

/** #3 Şablonları kategori adına göre gruplar (sıra: kategori adı). */
function groupByCategory<T extends { category?: { name?: string } }>(
  list: T[],
): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const t of list) {
    const key = t.category?.name ?? 'Diğer';
    const arr = map.get(key);
    if (arr) arr.push(t);
    else map.set(key, [t]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
}

/**
 * Tür Marka[Renk Kod] Kalınlıkxenxboy kalıbında otomatik ad üretir; eksik
 * kısımlar "—" ile gösterilir. #1 Başa kategori (tür) adı eklenir.
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

/**
 * Şablon kartındaki varsayılan özellikler: yalnız TANIMLI olanlar rozet olarak
 * gösterilir (eskiden eksikler "— · —" diye yazılıyordu).
 */
function templateSpecs(t: MaterialTemplate): { key: string; label: string; value: string }[] {
  const specs: { key: string; label: string; value: string }[] = [];
  if (t.defaultBrand?.name) specs.push({ key: 'brand', label: 'Marka', value: t.defaultBrand.name });
  if (t.defaultColor?.name)
    specs.push({
      key: 'color',
      label: 'Renk',
      value: t.defaultColor.code ? `${t.defaultColor.name} (${t.defaultColor.code})` : t.defaultColor.name,
    });
  if (t.defaultThickness)
    specs.push({ key: 'thickness', label: 'Kalınlık', value: `${Number(t.defaultThickness.valueMm)} mm` });
  if (t.defaultSize)
    specs.push({
      key: 'size',
      label: 'Ebat',
      value: `${Number(t.defaultSize.widthMm)}×${Number(t.defaultSize.heightMm)} mm`,
    });
  return specs;
}

/** Katalog seçimi bloğu (Marka / Renk / Ebat / Kalınlık): başlık + seçici + ekleme satırı. */
function CatalogBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

/**
 * Ürün türleri (şablonlar) yönetimi — yalnızca İşletme Sahibi.
 * Marka/renk/ebat/kalınlık katalogları kategoriye özeldir: bir kategoride
 * tanımlı kayıt başka kategoride seçilemez. Stok kalemi eklerken bu
 * şablonlardan biri seçilip miras alınır (override edilebilir).
 */
export function MaterialTemplatesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState<MaterialTemplateInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const formOpen = !!form;
  const [nameTouched, setNameTouched] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [newColorCode, setNewColorCode] = useState('');
  const [newColorBrand, setNewColorBrand] = useState('');
  const [newSizeWidth, setNewSizeWidth] = useState('');
  const [newSizeHeight, setNewSizeHeight] = useState('');
  const [newThicknessValue, setNewThicknessValue] = useState('');
  // Katalog kaydı düzenleme modu: alt satırdaki giriş kutuları seçili kaydı günceller.
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [editingThicknessId, setEditingThicknessId] = useState<string | null>(null);

  const { data: categories } = useMaterialCategories();
  const { data, isLoading } = useMaterialTemplates();

  const categoryId = form?.categoryId || undefined;
  const { data: brands } = useQuery({
    queryKey: ['material-brands', categoryId],
    queryFn: () => fetchMaterialBrands(categoryId),
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
  const { data: thicknesses } = useQuery({
    queryKey: ['material-thicknesses', categoryId],
    queryFn: () => fetchMaterialThicknesses(categoryId),
    enabled: !!categoryId,
  });

  /** Marka/renk/ebat/kalınlık seçimlerini forma uygular; isim elle değiştirilmediyse otomatik üretir. */
  // `known`: az önce eklenen kayıt (liste henüz tazelenmediği için ad
  // üretiminde ondan okunur; yoksa ad "—" ile kalıyordu).
  const patchCatalog = (
    patch: Partial<MaterialTemplateInput>,
    known: {
      brand?: { id: string; name: string };
      color?: { id: string; name: string; code?: string };
      size?: { id: string; widthMm: number; heightMm: number };
      thickness?: { id: string; valueMm: number };
    } = {},
  ) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, ...patch };
      if (nameTouched) return next;
      const pick = <T extends { id: string }>(k: T | undefined, list: T[] | undefined, id?: string | null) =>
        k && k.id === id ? k : list?.find((x) => x.id === id);
      const cat = categories?.find((c) => c.id === next.categoryId);
      const brand = pick(known.brand, brands, next.defaultBrandId);
      const color = pick(known.color, colors, next.defaultColorId);
      const size = pick(known.size, sizes, next.defaultSizeId);
      const thickness = pick(known.thickness, thicknesses, next.defaultThicknessId);
      return {
        ...next,
        name: buildCatalogName(cat?.name, brand, color, size, thickness),
      };
    });
  };

  // Stok listesi ve seçiciler kalemin ürün türünü (ad/tür/ebat) gösterir.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['material-templates'] });
    qc.invalidateQueries({ queryKey: ['plates'] });
  };

  const createMut = useMutation({
    mutationFn: createMaterialTemplate,
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MaterialTemplateInput> }) =>
      updateMaterialTemplate(id, input),
    onSuccess: () => {
      invalidate();
      setForm(null);
      setEditingId(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: deleteMaterialTemplate,
    onSuccess: invalidate,
  });

  const createBrandMut = useMutation({
    mutationFn: createMaterialBrand,
    onSuccess: (brand) => {
      qc.invalidateQueries({ queryKey: ['material-brands', categoryId] });
      patchCatalog({ defaultBrandId: brand.id }, { brand });
      setNewBrandName('');
    },
  });
  const createColorMut = useMutation({
    mutationFn: createMaterialColor,
    onSuccess: (color) => {
      qc.invalidateQueries({ queryKey: ['material-colors', categoryId] });
      patchCatalog({ defaultColorId: color.id }, { color });
      setNewColorName('');
      setNewColorCode('');
    },
  });
  const createSizeMut = useMutation({
    mutationFn: createMaterialSize,
    onSuccess: (size) => {
      qc.invalidateQueries({ queryKey: ['material-sizes', categoryId] });
      patchCatalog({ defaultSizeId: size.id }, { size });
      setNewSizeWidth('');
      setNewSizeHeight('');
    },
  });
  const createThicknessMut = useMutation({
    mutationFn: createMaterialThickness,
    onSuccess: (thickness) => {
      qc.invalidateQueries({ queryKey: ['material-thicknesses', categoryId] });
      patchCatalog({ defaultThicknessId: thickness.id }, { thickness });
      setNewThicknessValue('');
    },
  });

  // Katalog kayıtlarını düzenleme/silme (ebat, marka, renk, kalınlık).
  const updateBrandMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateMaterialBrand(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-brands', categoryId] });
      setEditingBrandId(null);
      setNewBrandName('');
    },
  });
  const deleteBrandMut = useMutation({
    mutationFn: deleteMaterialBrand,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-brands', categoryId] });
      setForm((f) => (f ? { ...f, defaultBrandId: null } : f));
    },
  });
  const updateColorMut = useMutation({
    mutationFn: ({
      id,
      name,
      code,
      brandId,
    }: {
      id: string;
      name: string;
      code?: string;
      brandId?: string | null;
    }) => updateMaterialColor(id, { name, code, brandId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-colors', categoryId] });
      setEditingColorId(null);
      setNewColorName('');
      setNewColorCode('');
    },
  });
  const deleteColorMut = useMutation({
    mutationFn: deleteMaterialColor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-colors', categoryId] });
      setForm((f) => (f ? { ...f, defaultColorId: null } : f));
    },
  });
  const updateSizeMut = useMutation({
    mutationFn: ({ id, widthMm, heightMm }: { id: string; widthMm: number; heightMm: number }) =>
      updateMaterialSize(id, { widthMm, heightMm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-sizes', categoryId] });
      setEditingSizeId(null);
      setNewSizeWidth('');
      setNewSizeHeight('');
    },
  });
  const deleteSizeMut = useMutation({
    mutationFn: deleteMaterialSize,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-sizes', categoryId] });
      setForm((f) => (f ? { ...f, defaultSizeId: null } : f));
    },
  });
  const updateThicknessMut = useMutation({
    mutationFn: ({ id, valueMm }: { id: string; valueMm: number }) =>
      updateMaterialThickness(id, { valueMm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-thicknesses', categoryId] });
      setEditingThicknessId(null);
      setNewThicknessValue('');
    },
  });
  const deleteThicknessMut = useMutation({
    mutationFn: deleteMaterialThickness,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-thicknesses', categoryId] });
      setForm((f) => (f ? { ...f, defaultThicknessId: null } : f));
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setNameTouched(false);
  };

  // Hızlı arama bağlantıları: ?new=1 yeni ürün türü formunu açar (yazma izni
  // varsa), ?q=metin listeyi süzer.
  useUrlParam('new', () => {
    if (can('catalog', 'write')) openCreate();
  });
  useUrlParam('q', (q) => setSearch(q));

  // Form açılınca / başka kayıt düzenlenince form görünür alana kaydırılır.
  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [formOpen, editingId]);

  /** Tek kayıt silme onayı (şablon ya da katalog kaydı). */
  const confirmDelete = (message: string) =>
    confirmDialog({ title: 'Silinsin mi?', message, confirmText: 'Sil', danger: true });

  // Önce tür (kategori) çipi ve arama; sonra marka/kalınlık/ebat/renk çipleri.
  // Arama sözcük sırasından bağımsızdır ("beyaz 2,8 akpolimer").
  const searched = useMemo(
    () =>
      (data ?? []).filter(
        (t) =>
          (!categoryFilter || t.categoryId === categoryFilter) &&
          matchesSearch(templateSearchText(t), search),
      ),
    [data, search, categoryFilter],
  );
  const facets = useFacets(searched, TEMPLATE_FACETS);
  const visible = facets.filtered;

  // Formdaki özelliklerle zaten bir ür. türü var mı (kaydetmeden önce uyar).
  const duplicateOf =
    form?.categoryId
      ? (data ?? []).find((t) => t.id !== editingId && templateKey(t) === templateKey(form))
      : undefined;
  // Geçmişte açılmış kopyalar: birleştirme önerisi.
  const duplicateGroups = useMemo(() => duplicateTemplateGroups(data ?? []), [data]);
  const mergeMut = useMutation({
    mutationFn: ({ keepId, sourceIds }: { keepId: string; sourceIds: string[] }) =>
      mergeMaterialTemplates(keepId, sourceIds),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['plates'] });
    },
  });

  const submit = () => {
    if (!form) return;
    if (editingId) {
      updateMut.mutate({ id: editingId, input: form });
    } else {
      createMut.mutate(form);
    }
  };

  const mutationError =
    createMut.error ??
    updateMut.error ??
    deleteMut.error ??
    updateBrandMut.error ??
    deleteBrandMut.error ??
    updateColorMut.error ??
    deleteColorMut.error ??
    updateSizeMut.error ??
    deleteSizeMut.error ??
    updateThicknessMut.error ??
    deleteThicknessMut.error;

  // Satır içi küçük düğmeler (✏️ / 🗑️ / Ekle / Vazgeç).
  const iconBtn = 'btn-secondary shrink-0 px-3';
  const iconDangerBtn = 'btn-danger-soft shrink-0 px-3';

  return (
    <div className="space-y-4">
      <PageHeader
        icon="🧩"
        title="Ürün Türleri"
        subtitle="Stok kalemleri bu şablonlardan oluşturulur; marka, renk, ebat ve kalınlık türden miras alınır."
        actions={
          !form && (
            <Can module="catalog" level="write">
              <button
                className="btn-primary"
                data-hotkey="n"
                title="Yeni ürün türü (N)"
                onClick={openCreate}
              >
                + Yeni Ürün Türü
              </button>
            </Can>
          )
        }
      />

      {mutationError && (
        <p className="card text-sm text-red-600">
          {(mutationError as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'İşlem başarısız.'}
        </p>
      )}

      {form && (
        <div ref={formRef} className="card space-y-3">
          <h2 className="font-semibold">
            {editingId ? 'Ürün türünü düzenle' : 'Yeni ürün türü'}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="label">
                Kategori <span className="text-red-600">*</span>
              </span>
              <select
                className="input"
                autoFocus={!editingId}
                value={form.categoryId}
                onChange={(e) => {
                  const cat = categories?.find((c) => c.id === e.target.value);
                  setNameTouched(false);
                  setForm({
                    ...form,
                    categoryId: e.target.value,
                    measurementType: cat?.defaultMeasurementType ?? form.measurementType,
                    // Kategori değişti — önceki kategorinin kataloğu geçersiz.
                    defaultBrandId: undefined,
                    defaultColorId: undefined,
                    defaultSizeId: undefined,
                    defaultThicknessId: undefined,
                    // #1 Ad kategori (tür) adıyla başlasın; kullanıcı elle değiştirebilir.
                    name: cat?.name ? `${cat.name} ` : '',
                  });
                }}
              >
                <option value="">Kategori seç…</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="label">Ölçü birimi</span>
              <select
                className="input"
                value={form.measurementType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    measurementType: e.target.value as MeasurementType,
                  })
                }
              >
                {Object.entries(MEASUREMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 sm:col-span-2">
              <span className="label">
                Ad <span className="text-red-600">*</span>
              </span>
              <input
                className="input"
                placeholder="Ad (örn. Alüminyum Kompozit 3mm)"
                value={form.name}
                onChange={(e) => {
                  setNameTouched(true);
                  setForm({ ...form, name: e.target.value });
                }}
              />
              <span className="mt-1 block text-xs text-slate-400">
                Marka/renk/ebat/kalınlık seçtikçe otomatik oluşur; elle değiştirebilirsiniz.
              </span>
            </label>
            <label className="block min-w-0 sm:col-span-2">
              <span className="label">Tür/Varyant</span>
              <input
                className="input"
                placeholder="Tür/Varyant (örn. Dökme / Çekme)"
                value={form.defaultVariant ?? ''}
                onChange={(e) => setForm({ ...form, defaultVariant: e.target.value })}
              />
            </label>
          </div>

          {!form.categoryId ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              Marka/renk/ebat/kalınlık seçmek için önce kategori seçin.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <CatalogBlock title="Marka">
                <div className="flex gap-2">
                  <select
                    className="input min-w-0 flex-1"
                    aria-label="Marka"
                    value={form.defaultBrandId ?? ''}
                    onChange={(e) =>
                      patchCatalog({
                        defaultBrandId: e.target.value || null,
                        // Seçili renk kodu başka markanınsa seçim kalkar.
                        ...(colors?.find((c) => c.id === form.defaultColorId)?.brandId &&
                        colors?.find((c) => c.id === form.defaultColorId)?.brandId !== (e.target.value || null)
                          ? { defaultColorId: null }
                          : {}),
                      })
                    }
                  >
                    <option value="">Marka seç…</option>
                    {brands?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {/* Seçili katalog kaydını düzenle / sil */}
                  <button
                    className={iconBtn}
                    title="Seçili markayı düzenle"
                    aria-label="Seçili markayı düzenle"
                    disabled={!form.defaultBrandId}
                    onClick={() => {
                      const b = brands?.find((x) => x.id === form.defaultBrandId);
                      if (!b) return;
                      setEditingBrandId(b.id);
                      setNewBrandName(b.name);
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    className={iconDangerBtn}
                    title="Seçili markayı sil"
                    aria-label="Seçili markayı sil"
                    disabled={!form.defaultBrandId || deleteBrandMut.isPending}
                    onClick={async () => {
                      const b = brands?.find((x) => x.id === form.defaultBrandId);
                      if (b && (await confirmDelete(`"${b.name}" markası silinsin mi?`))) {
                        deleteBrandMut.mutate(b.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input min-w-0 flex-1 basis-40"
                    placeholder={editingBrandId ? 'Marka adını düzenle' : '+ Yeni marka adı'}
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                  />
                  <button
                    className={iconBtn}
                    disabled={!newBrandName.trim()}
                    onClick={() =>
                      editingBrandId
                        ? updateBrandMut.mutate({
                            id: editingBrandId,
                            name: newBrandName.trim(),
                          })
                        : createBrandMut.mutate({
                            name: newBrandName.trim(),
                            categoryId: form.categoryId,
                          })
                    }
                  >
                    {editingBrandId ? 'Güncelle' : 'Ekle'}
                  </button>
                  {editingBrandId && (
                    <button
                      className="btn-ghost shrink-0 px-3"
                      onClick={() => {
                        setEditingBrandId(null);
                        setNewBrandName('');
                      }}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>
              </CatalogBlock>

              <CatalogBlock title="Renk ve kod">
                {/* Aynı renkte birden çok kod olabilir (Beyaz 1001 / 2002); markaya
                    bağlı kodlar o markanın türünde önce gelir. */}
                <ColorPicker
                  colors={colors}
                  brands={brands}
                  brandId={form.defaultBrandId}
                  value={form.defaultColorId}
                  onChange={(id) => patchCatalog({ defaultColorId: id })}
                  onCreate={(input) => createColorMut.mutateAsync({ ...input, categoryId: form.categoryId })}
                  creating={createColorMut.isPending}
                />
                {form.defaultColorId && !editingColorId && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const c = colors?.find((x) => x.id === form.defaultColorId);
                        if (!c) return;
                        setEditingColorId(c.id);
                        setNewColorName(c.name);
                        setNewColorCode(c.code ?? '');
                        setNewColorBrand(c.brandId ?? '');
                      }}
                    >
                      ✏️ Seçili rengi düzenle
                    </button>
                    <button
                      className="btn-danger-soft btn-sm"
                      disabled={deleteColorMut.isPending}
                      onClick={async () => {
                        const c = colors?.find((x) => x.id === form.defaultColorId);
                        if (c && (await confirmDelete(`"${c.name}${c.code ? ` ${c.code}` : ''}" rengi silinsin mi?`))) {
                          deleteColorMut.mutate(c.id);
                        }
                      }}
                    >
                      🗑️ Sil
                    </button>
                  </div>
                )}
                {editingColorId && (
                  <div className="flex flex-wrap gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                    <input
                      className="input min-w-0 flex-1 basis-36"
                      placeholder="Renk adı"
                      aria-label="Renk adını düzenle"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                    />
                    <input
                      className="input w-28 shrink-0 font-mono"
                      placeholder="Kod"
                      aria-label="Renk kodu"
                      value={newColorCode}
                      onChange={(e) => setNewColorCode(e.target.value)}
                    />
                    <select
                      className="input w-auto min-w-0"
                      aria-label="Rengin markası"
                      value={newColorBrand}
                      onChange={(e) => setNewColorBrand(e.target.value)}
                    >
                      <option value="">Bütün markalar</option>
                      {brands?.map((b) => (
                        <option key={b.id} value={b.id}>
                          Yalnız {b.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className={iconBtn}
                      disabled={!newColorName.trim() || updateColorMut.isPending}
                      onClick={() =>
                        updateColorMut.mutate({
                          id: editingColorId,
                          name: newColorName.trim(),
                          code: newColorCode.trim(),
                          brandId: newColorBrand || null,
                        })
                      }
                    >
                      Güncelle
                    </button>
                    <button
                      className="btn-ghost shrink-0 px-3"
                      onClick={() => {
                        setEditingColorId(null);
                        setNewColorName('');
                        setNewColorCode('');
                      }}
                    >
                      Vazgeç
                    </button>
                  </div>
                )}
              </CatalogBlock>

              <CatalogBlock title="Ebat (standart tabaka)">
                <div className="flex gap-2">
                  <select
                    className="input min-w-0 flex-1"
                    aria-label="Ebat"
                    value={form.defaultSizeId ?? ''}
                    onChange={(e) =>
                      patchCatalog({ defaultSizeId: e.target.value || null })
                    }
                  >
                    <option value="">Ebat seç…</option>
                    {sizes?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.widthMm}×{s.heightMm} mm
                      </option>
                    ))}
                  </select>
                  <button
                    className={iconBtn}
                    title="Seçili ebadı düzenle"
                    aria-label="Seçili ebadı düzenle"
                    disabled={!form.defaultSizeId}
                    onClick={() => {
                      const s = sizes?.find((x) => x.id === form.defaultSizeId);
                      if (!s) return;
                      setEditingSizeId(s.id);
                      setNewSizeWidth(String(Number(s.widthMm)));
                      setNewSizeHeight(String(Number(s.heightMm)));
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    className={iconDangerBtn}
                    title="Seçili ebadı sil"
                    aria-label="Seçili ebadı sil"
                    disabled={!form.defaultSizeId || deleteSizeMut.isPending}
                    onClick={async () => {
                      const s = sizes?.find((x) => x.id === form.defaultSizeId);
                      if (
                        s &&
                        (await confirmDelete(`${s.widthMm}×${s.heightMm} mm ebadı silinsin mi?`))
                      ) {
                        deleteSizeMut.mutate(s.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input min-w-0 flex-1 basis-24"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder={editingSizeId ? 'En (mm) düzenle' : '+ En (mm)'}
                    value={newSizeWidth}
                    onChange={(e) => setNewSizeWidth(e.target.value)}
                  />
                  <input
                    className="input min-w-0 flex-1 basis-24"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Boy (mm)"
                    value={newSizeHeight}
                    onChange={(e) => setNewSizeHeight(e.target.value)}
                  />
                  <button
                    className={iconBtn}
                    disabled={!newSizeWidth || !newSizeHeight}
                    onClick={() =>
                      editingSizeId
                        ? updateSizeMut.mutate({
                            id: editingSizeId,
                            widthMm: Number(newSizeWidth),
                            heightMm: Number(newSizeHeight),
                          })
                        : createSizeMut.mutate({
                            widthMm: Number(newSizeWidth),
                            heightMm: Number(newSizeHeight),
                            categoryId: form.categoryId,
                          })
                    }
                  >
                    {editingSizeId ? 'Güncelle' : 'Ekle'}
                  </button>
                  {editingSizeId && (
                    <button
                      className="btn-ghost shrink-0 px-3"
                      onClick={() => {
                        setEditingSizeId(null);
                        setNewSizeWidth('');
                        setNewSizeHeight('');
                      }}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>
              </CatalogBlock>

              <CatalogBlock title="Kalınlık">
                <div className="flex gap-2">
                  <select
                    className="input min-w-0 flex-1"
                    aria-label="Kalınlık"
                    value={form.defaultThicknessId ?? ''}
                    onChange={(e) =>
                      patchCatalog({ defaultThicknessId: e.target.value || null })
                    }
                  >
                    <option value="">Kalınlık seç…</option>
                    {thicknesses?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.valueMm} mm
                      </option>
                    ))}
                  </select>
                  <button
                    className={iconBtn}
                    title="Seçili kalınlığı düzenle"
                    aria-label="Seçili kalınlığı düzenle"
                    disabled={!form.defaultThicknessId}
                    onClick={() => {
                      const t = thicknesses?.find(
                        (x) => x.id === form.defaultThicknessId,
                      );
                      if (!t) return;
                      setEditingThicknessId(t.id);
                      setNewThicknessValue(String(Number(t.valueMm)));
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    className={iconDangerBtn}
                    title="Seçili kalınlığı sil"
                    aria-label="Seçili kalınlığı sil"
                    disabled={!form.defaultThicknessId || deleteThicknessMut.isPending}
                    onClick={async () => {
                      const t = thicknesses?.find(
                        (x) => x.id === form.defaultThicknessId,
                      );
                      if (t && (await confirmDelete(`${t.valueMm} mm kalınlık silinsin mi?`))) {
                        deleteThicknessMut.mutate(t.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input min-w-0 flex-1 basis-40"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder={
                      editingThicknessId
                        ? 'Kalınlığı (mm) düzenle'
                        : '+ Yeni kalınlık (mm)'
                    }
                    value={newThicknessValue}
                    onChange={(e) => setNewThicknessValue(e.target.value)}
                  />
                  <button
                    className={iconBtn}
                    disabled={!newThicknessValue}
                    onClick={() =>
                      editingThicknessId
                        ? updateThicknessMut.mutate({
                            id: editingThicknessId,
                            valueMm: Number(newThicknessValue),
                          })
                        : createThicknessMut.mutate({
                            valueMm: Number(newThicknessValue),
                            categoryId: form.categoryId,
                          })
                    }
                  >
                    {editingThicknessId ? 'Güncelle' : 'Ekle'}
                  </button>
                  {editingThicknessId && (
                    <button
                      className="btn-ghost shrink-0 px-3"
                      onClick={() => {
                        setEditingThicknessId(null);
                        setNewThicknessValue('');
                      }}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>
              </CatalogBlock>
            </div>
          )}

          <label className="block min-w-0">
            <span className="label">Açıklama</span>
            <input
              className="input"
              placeholder="Açıklama"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Aktif
          </label>
          {duplicateOf && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
              <p className="font-semibold">Bu özelliklerde bir ürün türü zaten var:</p>
              <p className="mt-0.5">“{stripNamePlaceholders(duplicateOf.name) || duplicateOf.name}”</p>
              <p className="mt-1 text-xs">
                Aynı ürünü ikinci kez açmayın; onu kullanın. Farklı bir ürünse <b>Tür/Varyant</b> alanına ayırt
                edici bir bilgi yazın (ör. Dökme / Çekme).
              </p>
              <button
                type="button"
                className="mt-2 font-semibold underline"
                onClick={() => {
                  const t = duplicateOf;
                  setEditingId(t.id);
                  setNameTouched(true);
                  setForm({
                    name: t.name,
                    categoryId: t.categoryId,
                    measurementType: t.measurementType,
                    defaultBrandId: t.defaultBrandId,
                    defaultColorId: t.defaultColorId,
                    defaultSizeId: t.defaultSizeId,
                    defaultThicknessId: t.defaultThicknessId,
                    defaultVariant: t.defaultVariant,
                    description: t.description,
                    isActive: t.isActive,
                  });
                }}
              >
                Var olanı aç
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <button
              className="btn-primary"
              disabled={
                !form.name.trim() ||
                !form.categoryId ||
                !!duplicateOf ||
                createMut.isPending ||
                updateMut.isPending
              }
              onClick={submit}
            >
              {createMut.isPending || updateMut.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Geçmişte açılmış kopyalar: tek dokunuşla birleştir. */}
      {can('catalog', 'write') && duplicateGroups.length > 0 && (
        <div className="card space-y-2 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            ⚠️ Aynı özellikte birden çok ürün türü var ({duplicateGroups.length} küme)
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Birleştirince stok kalemleri en eski türe taşınır; hiçbir stok, teklif ya da satış silinmez.
          </p>
          <ul className="space-y-1.5">
            {duplicateGroups.map((g) => (
              <li key={g[0].id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{stripNamePlaceholders(g[0].name) || g[0].name}</b>
                  <span className="text-amber-800 dark:text-amber-200">
                    {' '}
                    + {g.length - 1} kopya ({g
                      .slice(1)
                      .map((t) => stripNamePlaceholders(t.name) || t.name)
                      .join(', ')})
                  </span>
                </span>
                <button
                  className="btn-secondary btn-sm"
                  disabled={mergeMut.isPending}
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: 'Birleştirilsin mi?',
                        message: `${g.length - 1} kopya “${stripNamePlaceholders(g[0].name) || g[0].name}” türüne birleştirilecek; stok kalemleri ona taşınır.`,
                        confirmText: 'Birleştir',
                      })
                    )
                      mergeMut.mutate({ keepId: g[0].id, sourceIds: g.slice(1).map((t) => t.id) });
                  }}
                >
                  Birleştir
                </button>
              </li>
            ))}
          </ul>
          {mergeMut.isError && (
            <p className="text-sm text-red-600">
              {(mergeMut.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Birleştirilemedi.'}
            </p>
          )}
        </div>
      )}

      {!isLoading && !!data?.length && (
        <Filters
          search={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Ara: beyaz 2,8 akpolimer…"
              aria-label="Ürün türlerinde ara"
            />
          }
          activeCount={facets.activeCount + (categoryFilter ? 1 : 0)}
          onClear={() => {
            setCategoryFilter('');
            facets.clear();
          }}
        >
          <div className="space-y-2">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {[{ id: '', name: 'Tümü' }, ...(categories ?? [])].map((c) => (
                <button
                  key={c.id}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                    categoryFilter === c.id
                      ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  onClick={() => {
                    setCategoryFilter(c.id);
                    facets.clear();
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <FacetChips facets={TEMPLATE_FACETS} state={facets} hideClear />
          </div>
        </Filters>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          icon="🧩"
          title="Henüz ürün türü yok"
          hint="Ürün türü (şablon), stok kalemi eklerken seçilir ve marka/renk/ebat/kalınlık bilgisini taşır. Önce bir malzeme türü (kategori) tanımlı olmalıdır."
          action={
            !form && (
              <Can module="catalog" level="write">
                <button className="btn-primary" onClick={openCreate}>
                  + Yeni Ürün Türü
                </button>
              </Can>
            )
          }
        />
      ) : !visible.length ? (
        <EmptyState
          compact
          icon="🔍"
          title="Aramaya uyan ürün türü yok"
          hint="Farklı bir kelime deneyin."
          action={
            <button
              className="btn-secondary btn-sm"
              onClick={() => {
                setSearch('');
                setCategoryFilter('');
                facets.clear();
              }}
            >
              Süzgeci temizle
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* #3 Malzemeler kategorilerine göre gruplanır. */}
          {groupByCategory(visible).map(([catName, tpls]) => (
            <GroupSection
              key={catName}
              title={catName}
              count={tpls.length}
              countLabel="tür"
            >
              {tpls.map((t) => {
                const specs = templateSpecs(t);
                // Otomatik adda eksik kısımlar "—" ile duruyor: başlıkta temiz
                // hâli gösterilir, eksik olduğu küçük bir rozetle belirtilir.
                const incomplete = t.name.includes('—');
                const title = stripNamePlaceholders(t.name) || t.category?.name || t.name;
                return (
                  <div
                    key={t.id}
                    className={`card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${
                      editingId === t.id ? 'ring-2 ring-blue-500/40' : ''
                    }`}
                  >
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="break-words">{title}</span>
                        {!t.isActive && (
                          <span className="badge bg-slate-100 text-slate-500">Pasif</span>
                        )}
                        {incomplete && (
                          <span
                            className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                            title={`Kayıtlı ad: ${t.name} — eksik kısımları Düzenle ile tamamlayabilirsiniz.`}
                          >
                            Ad eksik
                          </span>
                        )}
                      </h3>
                      <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                        <span className="badge bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                          {MEASUREMENT_LABELS[t.measurementType as MaterialMeasurementType] ??
                            t.measurementType}
                        </span>
                        {t.defaultVariant && <span>{t.defaultVariant}</span>}
                      </p>
                      {specs.length > 0 ? (
                        <p className="flex flex-wrap gap-1.5">
                          {specs.map((sp) => (
                            <span
                              key={sp.key}
                              className="badge bg-slate-100 font-normal text-slate-600"
                            >
                              <span className="text-slate-400">{sp.label}:</span> {sp.value}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      {t.description && (
                        <p className="text-xs text-slate-400">{t.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setEditingId(t.id);
                          setNameTouched(true);
                          setForm({
                            name: t.name,
                            categoryId: t.categoryId,
                            measurementType: t.measurementType,
                            defaultBrandId: t.defaultBrandId,
                            defaultColorId: t.defaultColorId,
                            defaultSizeId: t.defaultSizeId,
                            defaultThicknessId: t.defaultThicknessId,
                            defaultVariant: t.defaultVariant,
                            description: t.description,
                            isActive: t.isActive,
                          });
                        }}
                      >
                        ✏️ Düzenle
                      </button>
                      <button
                        className="btn-danger-soft btn-sm"
                        disabled={deleteMut.isPending}
                        onClick={async () => {
                          if (await confirmDelete(`"${title}" ürün türü silinsin mi?`)) {
                            deleteMut.mutate(t.id);
                          }
                        }}
                      >
                        🗑️ Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </GroupSection>
          ))}
        </div>
      )}
    </div>
  );
}
