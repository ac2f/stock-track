import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createMaterialCategory,
  deleteMaterialCategory,
  fetchMaterialCategories,
  updateMaterialCategory,
  type MaterialCategoryInput,
} from '../../api/materials.api';
import type { MeasurementType } from '../../types';

const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  area: 'Alan (m²)',
  length: 'Uzunluk (metre)',
  piece: 'Adet',
  weight: 'Ağırlık (kg)',
};

const EMPTY: MaterialCategoryInput = {
  name: '',
  code: '',
  defaultMeasurementType: 'area',
  isActive: true,
};

/**
 * Malzeme türleri (kategoriler) yönetimi — yalnızca İşletme Sahibi.
 * Warehouse/Machine ile aynı basit liste + ekle/düzenle/sil deseni.
 */
export function MaterialCategoriesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<MaterialCategoryInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['material-categories'] });

  const createMut = useMutation({
    mutationFn: createMaterialCategory,
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MaterialCategoryInput> }) =>
      updateMaterialCategory(id, input),
    onSuccess: () => {
      invalidate();
      setForm(null);
      setEditingId(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: deleteMaterialCategory,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Malzeme Türleri</h1>
        {!form && (
          <button
            className="btn-primary"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY);
            }}
          >
            + Yeni Tür
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
            placeholder="Ad (örn. Alüminyum)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Kod (örn. aluminum)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <select
            className="input"
            value={form.defaultMeasurementType}
            onChange={(e) =>
              setForm({
                ...form,
                defaultMeasurementType: e.target.value as MeasurementType,
              })
            }
          >
            {Object.entries(MEASUREMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
          {data?.map((c) => (
            <div key={c.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-medium">
                  {c.name}{' '}
                  {!c.isActive && (
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Pasif
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500">
                  {c.code} · {MEASUREMENT_LABELS[c.defaultMeasurementType]}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    setEditingId(c.id);
                    setForm({
                      name: c.name,
                      code: c.code,
                      defaultMeasurementType: c.defaultMeasurementType,
                      isActive: c.isActive,
                    });
                  }}
                >
                  Düzenle
                </button>
                <button
                  className="btn text-red-600"
                  onClick={() => {
                    if (confirm(`"${c.name}" silinsin mi?`)) {
                      deleteMut.mutate(c.id);
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
