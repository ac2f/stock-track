import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import {
  createMaterialCategory,
  deleteMaterialCategory,
  updateMaterialCategory,
  type MaterialCategoryInput,
} from '../../api/materials.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useMaterialCategories, useMaterialTemplates } from '../../hooks/useReferenceData';
import { useUrlParam } from '../../hooks/useUrlParam';
import { apiErrorMessage } from '../../lib/toast';
import type { MaterialCategory, MaterialMeasurementType, MeasurementType } from '../../types';

const UNIT_LABEL: Record<MaterialMeasurementType, string> = {
  area: 'Alan (m²)',
  length: 'Uzunluk (m)',
  piece: 'Adet',
  weight: 'Ağırlık (kg)',
};
const UNIT_SHORT: Record<MaterialMeasurementType, string> = { area: 'm²', length: 'm', piece: 'adet', weight: 'kg' };

const EMPTY: MaterialCategoryInput = { name: '', code: '', defaultMeasurementType: 'area', isActive: true };

/** Boş kod göndermeyin: sunucu kodu isteğe bağlı sayar ve boşsa addan benzersiz üretir ('' ise 400 döner). */
const clean = (v: MaterialCategoryInput): MaterialCategoryInput => ({ ...v, name: v.name.trim(), code: v.code?.trim() || undefined });

/** Satır içi ekleme/düzenleme formu: iki sütun, tek satırda biter. */
function CategoryForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: MaterialCategoryInput;
  busy: boolean;
  onSubmit: (v: MaterialCategoryInput) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  return (
    <div className="space-y-1.5 rounded-lg border border-blue-300 bg-blue-50/50 p-2 dark:border-blue-800 dark:bg-blue-950/20">
      <input
        className="input"
        autoFocus
        placeholder="Ad (örn. Pleksi)"
        aria-label="Malzeme türü adı"
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && f.name.trim() && !busy) onSubmit(f);
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <select
          className="input"
          aria-label="Ölçü birimi"
          value={f.defaultMeasurementType}
          onChange={(e) => setF({ ...f, defaultMeasurementType: e.target.value as MeasurementType })}
        >
          {Object.entries(UNIT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="input font-mono"
          placeholder="Kod (otomatik)"
          aria-label="Kod"
          value={f.code}
          onChange={(e) => setF({ ...f, code: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={f.isActive ?? true} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          Aktif
        </label>
        <span className="flex gap-1.5">
          <button type="button" className="btn-primary btn-sm" disabled={!f.name.trim() || busy} onClick={() => onSubmit(f)}>
            {busy ? '…' : 'Kaydet'}
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>
            İptal
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * Malzeme türleri (üst kategoriler): ekleme, düzenleme, silme ve süzme tek küçük panelde.
 * Bir türe tıklamak sağdaki ürün türlerini o türe daraltır; "Tümü" hepsini gösterir.
 */
export function CategoriesPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canWrite = can('catalog', 'write');
  const { data: categories, isLoading } = useMaterialCategories();
  const { data: templates } = useMaterialTemplates();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of templates ?? []) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [templates]);

  // Tür adı ürün türlerinde, stok listesinde ve seçicilerde de görünür.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['material-categories'] });
    qc.invalidateQueries({ queryKey: ['material-templates'] });
    qc.invalidateQueries({ queryKey: ['plates'] });
  };
  const create = useMutation({
    mutationFn: createMaterialCategory,
    onSuccess: () => {
      invalidate();
      setCreating(false);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MaterialCategoryInput> }) => updateMaterialCategory(id, input),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });
  const remove = useMutation({ mutationFn: deleteMaterialCategory, onSuccess: invalidate });

  // Hızlı arama bağlantısı: ?newCategory=1 yeni tür formunu açar.
  useUrlParam('newCategory', () => {
    if (canWrite) {
      setEditingId(null);
      setCreating(true);
    }
  });

  const del = async (c: MaterialCategory) => {
    if (
      await confirmDialog({
        title: 'Malzeme türü silinsin mi?',
        message: `"${c.name}" silinsin mi? Bu türe bağlı ürün türü varsa silinemez.`,
        confirmText: 'Sil',
        danger: true,
      })
    ) {
      remove.mutate(c.id, { onSuccess: () => selectedId === c.id && onSelect('') });
    }
  };

  const error = create.error ?? update.error ?? remove.error;
  const total = templates?.length ?? 0;

  const row = (id: string, label: string, count: number, extra?: ReactNode) => (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selectedId === id}
      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm ${
        selectedId === id
          ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {extra}
      <span className="text-[11px] tabular-nums text-slate-400">{count}</span>
    </button>
  );

  return (
    <div className="card space-y-1.5 !p-2" data-categories>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Malzeme türleri</h2>
        {canWrite && !creating && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            title="Yeni malzeme türü"
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
          >
            ＋ Tür
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {apiErrorMessage(error, 'İşlem başarısız.')}
        </p>
      )}

      {creating && (
        <CategoryForm initial={EMPTY} busy={create.isPending} onSubmit={(v) => create.mutate(clean(v))} onCancel={() => setCreating(false)} />
      )}

      <ul className="space-y-px">
        <li className="flex items-center">{row('', 'Tümü', total)}</li>
        {isLoading && <li className="px-2 py-1 text-xs text-slate-400">Yükleniyor…</li>}
        {categories?.map((c) => (
          <li key={c.id}>
            {editingId === c.id ? (
              <CategoryForm
                initial={{ name: c.name, code: c.code, defaultMeasurementType: c.defaultMeasurementType, isActive: c.isActive }}
                busy={update.isPending}
                onSubmit={(v) => update.mutate({ id: c.id, input: clean(v) })}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className={`group flex items-center ${c.isActive ? '' : 'opacity-60'}`}>
                {row(
                  c.id,
                  c.name,
                  counts.get(c.id) ?? 0,
                  <span className="text-[10px] text-slate-400" title={UNIT_LABEL[c.defaultMeasurementType as MaterialMeasurementType]}>
                    {UNIT_SHORT[c.defaultMeasurementType as MaterialMeasurementType] ?? ''}
                  </span>,
                )}
                {canWrite && (
                  <span className="flex shrink-0 opacity-60 group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-slate-200 dark:hover:bg-slate-700"
                      title="Düzenle"
                      aria-label={`${c.name} düzenle`}
                      onClick={() => {
                        setCreating(false);
                        setEditingId(c.id);
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-red-100 dark:hover:bg-red-900/40"
                      title="Sil"
                      aria-label={`${c.name} sil`}
                      disabled={remove.isPending}
                      onClick={() => del(c)}
                    >
                      🗑️
                    </button>
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!isLoading && !categories?.length && (
        <p className="px-2 py-1 text-xs text-slate-500">Henüz tür yok. Önce "＋ Tür" ile Pleksi, Dekota gibi bir ana tür ekleyin.</p>
      )}
    </div>
  );
}
