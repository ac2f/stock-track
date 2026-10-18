import { Can } from '../../components/Can';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  createMaterialCategory,
  deleteMaterialCategory,
  fetchMaterialCategories,
  updateMaterialCategory,
  type MaterialCategoryInput,
} from '../../api/materials.api';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useUrlParam } from '../../hooks/useUrlParam';
import { useAuth } from '../../context/AuthContext';
import type { MaterialCategory, MaterialMeasurementType, MeasurementType } from '../../types';

const MEASUREMENT_LABELS: Record<MaterialMeasurementType, string> = {
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
  const { can } = useAuth();
  const [form, setForm] = useState<MaterialCategoryInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const formOpen = !!form;

  // Listeden "Düzenle" denince form görünür alana kaydırılır.
  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [formOpen, editingId]);

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

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  // Hızlı arama bağlantısı: ?new=1 yeni tür formunu açar (yazma izni varsa).
  useUrlParam('new', () => {
    if (can('catalog', 'write')) openCreate();
  });

  const remove = async (c: MaterialCategory) => {
    if (
      await confirmDialog({
        title: 'Tür silinsin mi?',
        message: `"${c.name}" silinsin mi?`,
        confirmText: 'Sil',
        danger: true,
      })
    ) {
      deleteMut.mutate(c.id);
    }
  };

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
      <PageHeader
        icon="🗂️"
        title="Malzeme Türleri"
        subtitle="Pleksi, dekota, folyo gibi ana türler ve ölçü birimleri. Ürün türleri bu türlere bağlanır."
        actions={
          !form && (
            <Can module="catalog" level="write">
              <button
                className="btn-primary"
                data-hotkey="n"
                title="Yeni tür (N)"
                onClick={openCreate}
              >
                + Yeni Tür
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
          <h2 className="font-semibold">{editingId ? 'Türü düzenle' : 'Yeni tür'}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="label">
                Ad <span className="text-red-600">*</span>
              </span>
              <input
                className="input"
                placeholder="Ad (örn. Alüminyum)"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block min-w-0">
              <span className="label">Kod</span>
              <input
                className="input"
                placeholder="Kod (örn. aluminum)"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label className="block min-w-0">
              <span className="label">Ölçü birimi</span>
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
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm sm:mt-5">
              <input
                type="checkbox"
                checked={form.isActive ?? true}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Aktif
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={!form.name.trim() || createMut.isPending || updateMut.isPending}
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

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          icon="🗂️"
          title="Henüz malzeme türü yok"
          hint="Önce Pleksi, Dekota gibi bir tür ekleyin; ardından bu türe ürün türleri (şablonlar) tanımlayabilirsiniz."
          action={
            !form && (
              <Can module="catalog" level="write">
                <button className="btn-primary" onClick={openCreate}>
                  + Yeni Tür
                </button>
              </Can>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {data.map((c) => (
            <div
              key={c.id}
              className={`card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
                editingId === c.id ? 'ring-2 ring-blue-500/40' : ''
              }`}
            >
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="break-words">{c.name}</span>
                  {!c.isActive && <span className="badge bg-slate-100 text-slate-500">Pasif</span>}
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span className="badge bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                    {MEASUREMENT_LABELS[c.defaultMeasurementType as MaterialMeasurementType] ??
                      c.defaultMeasurementType}
                  </span>
                  {c.code && (
                    <span className="font-mono text-xs text-slate-400" title="Kod">
                      {c.code}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  className="btn-secondary btn-sm"
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
                  ✏️ Düzenle
                </button>
                <button
                  className="btn-danger-soft btn-sm"
                  disabled={deleteMut.isPending}
                  onClick={() => remove(c)}
                >
                  🗑️ Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
