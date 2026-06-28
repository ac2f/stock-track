import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchMaterialCategories } from '../../api/materials.api';
import {
  createMaterialTemplate,
  deleteMaterialTemplate,
  fetchMaterialTemplates,
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
 * Marka/renk/ebat/tür varsayımlarını burada tanımla; stok kalemi eklerken
 * bu şablonlardan biri seçilip miras alınır (override edilebilir).
 */
export function MaterialTemplatesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<MaterialTemplateInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
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

  const submit = () => {
    if (!form) return;
    if (editingId) {
      updateMut.mutate({ id: editingId, input: form });
    } else {
      createMut.mutate(form);
    }
  };

  const mutationError = createMut.error ?? updateMut.error ?? deleteMut.error;
  const isArea = form?.measurementType === 'area';

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
          <input
            className="input"
            placeholder="Marka"
            value={form.defaultBrand ?? ''}
            onChange={(e) => setForm({ ...form, defaultBrand: e.target.value })}
          />
          <input
            className="input"
            placeholder="Renk"
            value={form.defaultColor ?? ''}
            onChange={(e) => setForm({ ...form, defaultColor: e.target.value })}
          />
          <input
            className="input"
            placeholder="Renk Kodu"
            value={form.defaultColorCode ?? ''}
            onChange={(e) => setForm({ ...form, defaultColorCode: e.target.value })}
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Kalınlık (mm)"
            value={form.defaultThicknessMm ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                defaultThicknessMm: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
          {isArea && (
            <div className="flex gap-2">
              <input
                className="input"
                type="number"
                min={0}
                placeholder="En (mm)"
                value={form.defaultWidthMm ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultWidthMm: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <input
                className="input"
                type="number"
                min={0}
                placeholder="Boy (mm)"
                value={form.defaultHeightMm ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultHeightMm: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
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
                  {t.defaultBrand ?? '—'} · {t.defaultColor ?? '—'}
                  {t.defaultColorCode ? ` (${t.defaultColorCode})` : ''}
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
                      defaultBrand: t.defaultBrand,
                      defaultColor: t.defaultColor,
                      defaultColorCode: t.defaultColorCode,
                      defaultVariant: t.defaultVariant,
                      defaultThicknessMm: t.defaultThicknessMm,
                      defaultWidthMm: t.defaultWidthMm,
                      defaultHeightMm: t.defaultHeightMm,
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
