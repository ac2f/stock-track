import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createMaterialBrand,
  createMaterialColor,
  createMaterialSize,
  createMaterialTemplate,
  createMaterialThickness,
  deleteMaterialTemplate,
  fetchMaterialBrands,
  fetchMaterialCategories,
  fetchMaterialColors,
  fetchMaterialSizes,
  fetchMaterialTemplates,
  fetchMaterialThicknesses,
  updateMaterialTemplate,
  type MaterialTemplateInput,
} from '../../api/materials.api';
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
  const [newBrandName, setNewBrandName] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [newColorCode, setNewColorCode] = useState('');
  const [newSizeWidth, setNewSizeWidth] = useState('');
  const [newSizeHeight, setNewSizeHeight] = useState('');
  const [newThicknessValue, setNewThicknessValue] = useState('');

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

  const submit = () => {
    if (!form) return;
    if (editingId) {
      updateMut.mutate({ id: editingId, input: form });
    } else {
      createMut.mutate(form);
    }
  };

  const mutationError = createMut.error ?? updateMut.error ?? deleteMut.error;

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
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="input"
            value={form.categoryId}
            onChange={(e) => {
              const cat = categories?.find((c) => c.id === e.target.value);
              setForm({
                ...form,
                categoryId: e.target.value,
                measurementType: cat?.defaultMeasurementType ?? form.measurementType,
                // Kategori değişti — önceki kategorinin kataloğu geçersiz.
                defaultBrandId: undefined,
                defaultColorId: undefined,
                defaultSizeId: undefined,
                defaultThicknessId: undefined,
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
                      setForm({ ...form, defaultBrandId: e.target.value || undefined })
                    }
                  >
                    <option value="">Marka seç…</option>
                    {brands?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="+ Yeni marka adı"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                  />
                  <button
                    className="btn"
                    disabled={!newBrandName.trim()}
                    onClick={() =>
                      createBrandMut.mutate({
                        name: newBrandName.trim(),
                        categoryId: form.categoryId,
                      })
                    }
                  >
                    Ekle
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <select
                  className="input w-full"
                  value={form.defaultColorId ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, defaultColorId: e.target.value || undefined })
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
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="+ Yeni renk adı"
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
                      createColorMut.mutate({
                        name: newColorName.trim(),
                        code: newColorCode.trim() || undefined,
                        categoryId: form.categoryId,
                      })
                    }
                  >
                    Ekle
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <select
                  className="input w-full"
                  value={form.defaultSizeId ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, defaultSizeId: e.target.value || undefined })
                  }
                >
                  <option value="">Ebat seç…</option>
                  {sizes?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.widthMm}×{s.heightMm} mm
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="number"
                    min={0}
                    placeholder="+ En (mm)"
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
                      createSizeMut.mutate({
                        widthMm: Number(newSizeWidth),
                        heightMm: Number(newSizeHeight),
                        categoryId: form.categoryId,
                      })
                    }
                  >
                    Ekle
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <select
                  className="input w-full"
                  value={form.defaultThicknessId ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, defaultThicknessId: e.target.value || undefined })
                  }
                >
                  <option value="">Kalınlık seç…</option>
                  {thicknesses?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.valueMm} mm
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="number"
                    min={0}
                    placeholder="+ Yeni kalınlık (mm)"
                    value={newThicknessValue}
                    onChange={(e) => setNewThicknessValue(e.target.value)}
                  />
                  <button
                    className="btn"
                    disabled={!newThicknessValue}
                    onClick={() =>
                      createThicknessMut.mutate({
                        valueMm: Number(newThicknessValue),
                        categoryId: form.categoryId,
                      })
                    }
                  >
                    Ekle
                  </button>
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
        <div className="space-y-2">
          {data?.map((t) => (
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
          {!data?.length && <p className="text-slate-400">Kayıt bulunamadı.</p>}
        </div>
      )}
    </div>
  );
}
