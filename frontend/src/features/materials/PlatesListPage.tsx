import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createPlate,
  fetchMaterialCategories,
  fetchMaterialTemplates,
  fetchPlates,
  type CreatePlateInput,
  type PlateFilters,
} from '../../api/materials.api';
import { fetchWarehouses } from '../../api/warehouses.api';
import { RoleGate } from '../../components/RoleGate';

function areaM2(widthMm?: number, heightMm?: number): number | null {
  if (!widthMm || !heightMm) return null;
  return (widthMm / 1000) * (heightMm / 1000);
}

const EMPTY_PLATE: CreatePlateInput = { templateId: '' };

function NewPlateForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreatePlateInput>(EMPTY_PLATE);

  const { data: templates } = useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: fetchWarehouses,
  });

  const selectedTemplate = templates?.find((t) => t.id === form.templateId);
  const measurementType = form.measurementType ?? selectedTemplate?.measurementType;
  const isArea = measurementType === 'area';
  const preview = isArea ? areaM2(form.widthMm, form.heightMm) : null;

  const createMut = useMutation({
    mutationFn: createPlate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      onClose();
    },
  });

  const applyTemplateDefaults = (templateId: string) => {
    const tpl = templates?.find((t) => t.id === templateId);
    setForm({
      ...form,
      templateId,
      measurementType: tpl?.measurementType,
      brand: tpl?.defaultBrand,
      color: tpl?.defaultColor,
      colorCode: tpl?.defaultColorCode,
      variant: tpl?.defaultVariant,
      thicknessMm: tpl?.defaultThicknessMm,
      widthMm: tpl?.defaultWidthMm,
      heightMm: tpl?.defaultHeightMm,
    });
  };

  return (
    <div className="card space-y-3">
      {createMut.error && (
        <p className="text-sm text-red-600">
          {(createMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Stok kalemi oluşturulamadı.'}
        </p>
      )}
      <select
        className="input"
        value={form.templateId}
        onChange={(e) => applyTemplateDefaults(e.target.value)}
      >
        <option value="">Ürün türü seç…</option>
        {templates?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {form.templateId && (
        <>
          <input
            className="input"
            placeholder="Ad (boş bırakılırsa otomatik oluşturulur)"
            value={form.name ?? ''}
            onChange={(e) => setForm({ ...form, name: e.target.value || undefined })}
          />
          <input
            className="input"
            placeholder="Stok Kodu / SKU"
            value={form.sku ?? ''}
            onChange={(e) => setForm({ ...form, sku: e.target.value || undefined })}
          />
          <input
            className="input"
            placeholder="Tür/Varyant (örn. Dökme / Çekme)"
            value={form.variant ?? ''}
            onChange={(e) => setForm({ ...form, variant: e.target.value || undefined })}
          />
          <input
            className="input"
            placeholder="Marka"
            value={form.brand ?? ''}
            onChange={(e) => setForm({ ...form, brand: e.target.value || undefined })}
          />
          <input
            className="input"
            placeholder="Renk"
            value={form.color ?? ''}
            onChange={(e) => setForm({ ...form, color: e.target.value || undefined })}
          />
          <input
            className="input"
            placeholder="Renk Kodu"
            value={form.colorCode ?? ''}
            onChange={(e) => setForm({ ...form, colorCode: e.target.value || undefined })}
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Kalınlık (mm)"
            value={form.thicknessMm ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                thicknessMm: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />

          {isArea && (
            <div className="space-y-1">
              <div className="flex gap-2">
                <input
                  className="input"
                  type="number"
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
              {preview != null && (
                <p className="text-sm text-slate-500">≈ {preview.toFixed(3)} m²</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Açılış Stoğu"
              value={form.quantityInStock ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  quantityInStock: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
            <select
              className="input"
              value={form.warehouseId ?? ''}
              onChange={(e) =>
                setForm({ ...form, warehouseId: e.target.value || undefined })
              }
            >
              <option value="">Varsayılan depo</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Kritik Stok Eşiği"
            value={form.reorderLevel ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                reorderLevel: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </>
      )}

      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={!form.templateId}
          onClick={() => createMut.mutate(form)}
        >
          Kaydet
        </button>
        <button className="btn" onClick={onClose}>
          İptal
        </button>
      </div>
    </div>
  );
}

/**
 * Plaka (stok) listesi + gelişmiş filtreleme.
 * Mobil: tek sütun kartlar; masaüstü: çok sütunlu ızgara.
 */
export function PlatesListPage() {
  const [filters, setFilters] = useState<PlateFilters>({ page: 1, limit: 20 });
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['plates', filters],
    queryFn: () => fetchPlates(filters),
  });
  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });

  const set = (patch: Partial<PlateFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stok / Plakalar</h1>
        <div className="flex items-center gap-3">
          <RoleGate roles={['owner']}>
            <Link to="/material-templates" className="text-sm text-slate-500 underline">
              Ürün Türlerini Yönet
            </Link>
            <Link to="/material-categories" className="text-sm text-slate-500 underline">
              Türleri Yönet
            </Link>
          </RoleGate>
          {!showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Yeni Stok Kalemi
            </button>
          )}
        </div>
      </div>

      {showForm && <NewPlateForm onClose={() => setShowForm(false)} />}

      {/* Filtre çubuğu — mobilde yatay kaydırılır */}
      <div className="card space-y-3">
        <input
          className="input"
          placeholder="Ara (ad, stok kodu, renk kodu)…"
          onChange={(e) => set({ search: e.target.value || undefined })}
        />
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          <select
            className="input w-auto"
            onChange={(e) => set({ categoryId: e.target.value || undefined })}
          >
            <option value="">Tüm türler</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="input w-32"
            placeholder="Marka"
            onChange={(e) => set({ brand: e.target.value || undefined })}
          />
          <input
            className="input w-32"
            placeholder="Renk"
            onChange={(e) => set({ color: e.target.value || undefined })}
          />
          <label className="flex min-h-[44px] shrink-0 items-center gap-2 px-2 text-sm">
            <input
              type="checkbox"
              onChange={(e) => set({ inStock: e.target.checked || undefined })}
            />
            Stokta
          </label>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((plate) => {
            const m2 = areaM2(plate.widthMm, plate.heightMm);
            return (
              <div key={plate.id} className="card">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium">{plate.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      plate.quantityInStock > 0
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {plate.quantityInStock} adet
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {plate.brand ?? '—'} · {plate.color ?? '—'}
                  {plate.colorCode ? ` (${plate.colorCode})` : ''}
                  {plate.variant ? ` · ${plate.variant}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {plate.widthMm}×{plate.heightMm}×{plate.thicknessMm} mm
                  {m2 != null ? ` · ${m2.toFixed(2)} m²` : ''}
                </p>
              </div>
            );
          })}
          {!data?.items.length && (
            <p className="text-slate-400">Kayıt bulunamadı.</p>
          )}
        </div>
      )}
    </div>
  );
}
