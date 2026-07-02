import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  fetchMaterialCategories,
  fetchMaterialColors,
  fetchMaterialSizes,
  fetchMaterialTemplates,
  fetchMaterialThicknesses,
  updateMaterialBrand,
  updateMaterialColor,
  updateMaterialSize,
  updateMaterialTemplate,
  updateMaterialThickness,
  type MaterialTemplateInput,
} from '../../api/materials.api';
import { GroupSection } from '../../components/GroupSection';
import type { MeasurementType } from '../../types';

const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
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
 * Ürün türleri (şablonlar) yönetimi — yalnızca İşletme Sahibi.
 * Marka/renk/ebat/kalınlık katalogları kategoriye özeldir: bir kategoride
 * tanımlı kayıt başka kategoride seçilemez. Stok kalemi eklerken bu
 * şablonlardan biri seçilip miras alınır (override edilebilir).
 */
export function MaterialTemplatesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<MaterialTemplateInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [newColorCode, setNewColorCode] = useState('');
  const [newSizeWidth, setNewSizeWidth] = useState('');
  const [newSizeHeight, setNewSizeHeight] = useState('');
  const [newThicknessValue, setNewThicknessValue] = useState('');
  // Katalog kaydı düzenleme modu: alt satırdaki giriş kutuları seçili kaydı günceller.
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [editingThicknessId, setEditingThicknessId] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
  });

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
  const patchCatalog = (patch: Partial<MaterialTemplateInput>) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, ...patch };
      if (nameTouched) return next;
      const cat = categories?.find((c) => c.id === next.categoryId);
      const brand = brands?.find((b) => b.id === next.defaultBrandId);
      const color = colors?.find((c) => c.id === next.defaultColorId);
      const size = sizes?.find((s) => s.id === next.defaultSizeId);
      const thickness = thicknesses?.find((t) => t.id === next.defaultThicknessId);
      return {
        ...next,
        name: buildCatalogName(cat?.name, brand, color, size, thickness),
      };
    });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['material-templates'] });

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
      setForm((f) => (f ? { ...f, defaultBrandId: brand.id } : f));
      setNewBrandName('');
    },
  });
  const createColorMut = useMutation({
    mutationFn: createMaterialColor,
    onSuccess: (color) => {
      qc.invalidateQueries({ queryKey: ['material-colors', categoryId] });
      setForm((f) => (f ? { ...f, defaultColorId: color.id } : f));
      setNewColorName('');
      setNewColorCode('');
    },
  });
  const createSizeMut = useMutation({
    mutationFn: createMaterialSize,
    onSuccess: (size) => {
      qc.invalidateQueries({ queryKey: ['material-sizes', categoryId] });
      setForm((f) => (f ? { ...f, defaultSizeId: size.id } : f));
      setNewSizeWidth('');
      setNewSizeHeight('');
    },
  });
  const createThicknessMut = useMutation({
    mutationFn: createMaterialThickness,
    onSuccess: (thickness) => {
      qc.invalidateQueries({ queryKey: ['material-thicknesses', categoryId] });
      setForm((f) => (f ? { ...f, defaultThicknessId: thickness.id } : f));
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
    mutationFn: ({ id, name, code }: { id: string; name: string; code?: string }) =>
      updateMaterialColor(id, { name, code }),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ürün Türleri</h1>
        {!form && (
          <button
            className="btn-primary"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY);
              setNameTouched(false);
            }}
          >
            + Yeni Ürün Türü
          </button>
        )}
      </div>

      {mutationError && (
        <p className="card text-sm text-red-600">
          {(mutationError as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'İşlem başarısız.'}
        </p>
      )}

      {form && (
        <div className="card space-y-3">
          <input
            className="input"
            placeholder="Ad (örn. Alüminyum Kompozit 3mm)"
            value={form.name}
            onChange={(e) => {
              setNameTouched(true);
              setForm({ ...form, name: e.target.value });
            }}
          />
          <select
            className="input"
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
          <input
            className="input"
            placeholder="Tür/Varyant (örn. Dökme / Çekme)"
            value={form.defaultVariant ?? ''}
            onChange={(e) => setForm({ ...form, defaultVariant: e.target.value })}
          />

          {!form.categoryId ? (
            <p className="text-sm text-slate-400">
              Marka/renk/ebat/kalınlık seçmek için önce kategori seçin.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex gap-2">
                  <select
                    className="input flex-1"
                    value={form.defaultBrandId ?? ''}
                    onChange={(e) =>
                      patchCatalog({ defaultBrandId: e.target.value || null })
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
                    className="btn"
                    title="Seçili markayı düzenle"
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
                    className="btn text-red-600"
                    title="Seçili markayı sil"
                    disabled={!form.defaultBrandId || deleteBrandMut.isPending}
                    onClick={() => {
                      const b = brands?.find((x) => x.id === form.defaultBrandId);
                      if (b && confirm(`"${b.name}" markası silinsin mi?`)) {
                        deleteBrandMut.mutate(b.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder={editingBrandId ? 'Marka adını düzenle' : '+ Yeni marka adı'}
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                  />
                  <button
                    className="btn"
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
                      className="btn"
                      onClick={() => {
                        setEditingBrandId(null);
                        setNewBrandName('');
                      }}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex gap-2">
                  <select
                    className="input flex-1"
                    value={form.defaultColorId ?? ''}
                    onChange={(e) =>
                      patchCatalog({ defaultColorId: e.target.value || null })
                    }
                  >
                    <option value="">Renk seç…</option>
                    {colors?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.code ? ` (${c.code})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    title="Seçili rengi düzenle"
                    disabled={!form.defaultColorId}
                    onClick={() => {
                      const c = colors?.find((x) => x.id === form.defaultColorId);
                      if (!c) return;
                      setEditingColorId(c.id);
                      setNewColorName(c.name);
                      setNewColorCode(c.code ?? '');
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    className="btn text-red-600"
                    title="Seçili rengi sil"
                    disabled={!form.defaultColorId || deleteColorMut.isPending}
                    onClick={() => {
                      const c = colors?.find((x) => x.id === form.defaultColorId);
                      if (c && confirm(`"${c.name}" rengi silinsin mi?`)) {
                        deleteColorMut.mutate(c.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder={editingColorId ? 'Renk adını düzenle' : '+ Yeni renk adı'}
                    value={newColorName}
                    onChange={(e) => setNewColorName(e.target.value)}
                  />
                  <input
                    className="input w-28"
                    placeholder="Kod"
                    value={newColorCode}
                    onChange={(e) => setNewColorCode(e.target.value)}
                  />
                  <button
                    className="btn"
                    disabled={!newColorName.trim()}
                    onClick={() =>
                      editingColorId
                        ? updateColorMut.mutate({
                            id: editingColorId,
                            name: newColorName.trim(),
                            code: newColorCode.trim() || undefined,
                          })
                        : createColorMut.mutate({
                            name: newColorName.trim(),
                            code: newColorCode.trim() || undefined,
                            categoryId: form.categoryId,
                          })
                    }
                  >
                    {editingColorId ? 'Güncelle' : 'Ekle'}
                  </button>
                  {editingColorId && (
                    <button
                      className="btn"
                      onClick={() => {
                        setEditingColorId(null);
                        setNewColorName('');
                        setNewColorCode('');
                      }}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex gap-2">
                  <select
                    className="input flex-1"
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
                    className="btn"
                    title="Seçili ebadı düzenle"
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
                    className="btn text-red-600"
                    title="Seçili ebadı sil"
                    disabled={!form.defaultSizeId || deleteSizeMut.isPending}
                    onClick={() => {
                      const s = sizes?.find((x) => x.id === form.defaultSizeId);
                      if (
                        s &&
                        confirm(`${s.widthMm}×${s.heightMm} mm ebadı silinsin mi?`)
                      ) {
                        deleteSizeMut.mutate(s.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="number"
                    min={0}
                    placeholder={editingSizeId ? 'En (mm) düzenle' : '+ En (mm)'}
                    value={newSizeWidth}
                    onChange={(e) => setNewSizeWidth(e.target.value)}
                  />
                  <input
                    className="input flex-1"
                    type="number"
                    min={0}
                    placeholder="Boy (mm)"
                    value={newSizeHeight}
                    onChange={(e) => setNewSizeHeight(e.target.value)}
                  />
                  <button
                    className="btn"
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
                      className="btn"
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
              </div>

              <div className="space-y-1">
                <div className="flex gap-2">
                  <select
                    className="input flex-1"
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
                    className="btn"
                    title="Seçili kalınlığı düzenle"
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
                    className="btn text-red-600"
                    title="Seçili kalınlığı sil"
                    disabled={!form.defaultThicknessId || deleteThicknessMut.isPending}
                    onClick={() => {
                      const t = thicknesses?.find(
                        (x) => x.id === form.defaultThicknessId,
                      );
                      if (t && confirm(`${t.valueMm} mm kalınlık silinsin mi?`)) {
                        deleteThicknessMut.mutate(t.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="number"
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
                    className="btn"
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
                      className="btn"
                      onClick={() => {
                        setEditingThicknessId(null);
                        setNewThicknessValue('');
                      }}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          <input
            className="input"
            placeholder="Açıklama"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Aktif
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={submit}>
              Kaydet
            </button>
            <button
              className="btn"
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

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : (
        <div className="space-y-5">
          {/* #3 Malzemeler kategorilerine göre gruplanır. */}
          {groupByCategory(data ?? []).map(([catName, tpls]) => (
            <GroupSection
              key={catName}
              title={catName}
              count={tpls.length}
              countLabel="tür"
            >
              {tpls.map((t) => (
            <div key={t.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-medium">
                  {t.name}{' '}
                  {!t.isActive && (
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Pasif
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500">
                  {t.category?.name ?? '—'} · {MEASUREMENT_LABELS[t.measurementType]}
                  {t.defaultVariant ? ` · ${t.defaultVariant}` : ''}
                </p>
                <p className="text-xs text-slate-400">
                  {t.defaultBrand?.name ?? '—'} · {t.defaultColor?.name ?? '—'}
                  {t.defaultColor?.code ? ` (${t.defaultColor.code})` : ''}
                  {t.defaultSize ? ` · ${t.defaultSize.widthMm}×${t.defaultSize.heightMm} mm` : ''}
                  {t.defaultThickness ? ` · ${t.defaultThickness.valueMm} mm` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn"
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
                  Düzenle
                </button>
                <button
                  className="btn text-red-600"
                  onClick={() => {
                    if (confirm(`"${t.name}" silinsin mi?`)) {
                      deleteMut.mutate(t.id);
                    }
                  }}
                >
                  Sil
                </button>
              </div>
            </div>
              ))}
            </GroupSection>
          ))}
          {!data?.length && <p className="text-slate-400">Kayıt bulunamadı.</p>}
        </div>
      )}
    </div>
  );
}
