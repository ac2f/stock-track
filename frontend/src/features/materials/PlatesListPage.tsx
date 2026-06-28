import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  createPlate,
  fetchMaterialCategories,
  fetchMaterialTemplates,
  fetchPlateStockLevels,
  fetchPlates,
  transferPlateToBusiness,
  updatePlate,
  type CreatePlateInput,
  type PlateFilters,
  type TransferOwnershipInput,
  type UpdatePlateInput,
} from '../../api/materials.api';
import { fetchWarehouses } from '../../api/warehouses.api';
import { fetchCustomers } from '../../api/customers.api';
import { RoleGate } from '../../components/RoleGate';
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

/** Marka[Renk Kod] Kalınlıkxenxboy kalıbında otomatik ad üretir; eksik kısımlar "—" ile gösterilir. */
function buildCatalogName(
  brand: { name: string } | undefined,
  color: { name: string; code?: string } | undefined,
  size: { widthMm: number; heightMm: number } | undefined,
  thickness: { valueMm: number } | undefined,
): string {
  const brandPart = brand?.name ?? '—';
  const colorPart = color ? (color.code ? `${color.name} ${color.code}` : color.name) : '—';
  const thicknessPart = thickness?.valueMm ?? '—';
  const sizePart = size ? `${size.widthMm}x${size.heightMm}` : '—x—';
  return `${brandPart}[${colorPart}] ${thicknessPart}x${sizePart}`;
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
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function errMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? fallback
  );
}

function NewPlateForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreatePlateInput>(() => ({
    templateId: '',
    quantityInStock: 1,
    addedAt: todayISO(),
  }));
  const [skuTouched, setSkuTouched] = useState(false);
  const [owner, setOwner] = useState<'business' | 'customer'>('business');

  const { data: templates } = useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: fetchWarehouses,
  });
  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => fetchCustomers({ page: 1, limit: 100, sort: 'name' }),
  });

  const tpl = templates?.find((t) => t.id === form.templateId);
  const std = tpl?.defaultSize;
  const isArea = (form.measurementType ?? tpl?.measurementType) === 'area';
  const suggestedSku = tpl ? buildSku(tpl) : '';

  const overSheet =
    isArea &&
    !!std &&
    ((form.widthMm != null && form.widthMm > std.widthMm) ||
      (form.heightMm != null && form.heightMm > std.heightMm));
  const m2 = isArea ? areaM2(form.widthMm, form.heightMm) : null;

  const createMut = useMutation({
    mutationFn: createPlate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      onClose();
    },
  });

  // Ürün türü seçilince özellikler (ad/varyant/standart ebat) türden miras alınır.
  const applyTemplateDefaults = (templateId: string) => {
    const t = templates?.find((x) => x.id === templateId);
    setSkuTouched(false);
    setForm((f) => ({
      ...f,
      templateId,
      measurementType: t?.measurementType,
      variant: t?.defaultVariant,
      widthMm: t?.defaultSize?.widthMm,
      heightMm: t?.defaultSize?.heightMm,
      name: t
        ? buildCatalogName(t.defaultBrand, t.defaultColor, t.defaultSize, t.defaultThickness)
        : undefined,
    }));
  };

  const canSubmit =
    !!form.templateId &&
    !overSheet &&
    !(owner === 'customer' && !form.ownerCustomerId) &&
    !createMut.isPending;

  return (
    <div className="card space-y-3">
      {createMut.error && (
        <p className="text-sm text-red-600">
          {errMessage(createMut.error, 'Stok kalemi oluşturulamadı.')}
        </p>
      )}

      <Field label="Ürün türü (özellikler buradan gelir)">
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
      </Field>

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
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value || undefined })}
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

          <div className="flex gap-2">
            <Field label="Eklenme tarihi" className="flex-1">
              <input
                className="input"
                type="date"
                value={form.addedAt ?? ''}
                onChange={(e) => setForm({ ...form, addedAt: e.target.value || undefined })}
              />
            </Field>
            <Field label="İşlenme tarihi (varsa)" className="flex-1">
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
            <Field label="Sahip müşteri" hint="Sahipliği sonradan işletmeye aktarabilirsiniz.">
              <select
                className="input"
                value={form.ownerCustomerId ?? ''}
                onChange={(e) =>
                  setForm({ ...form, ownerCustomerId: e.target.value || undefined })
                }
              >
                <option value="">Müşteri seç…</option>
                {customers?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="flex gap-2">
            <Field label="Açılış stoğu (adet)" className="flex-1">
              <input
                className="input"
                type="number"
                min={0}
                value={form.quantityInStock ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantityInStock: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
            <Field label="Depo" className="flex-1">
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
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={!canSubmit} onClick={() => createMut.mutate(form)}>
          Kaydet
        </button>
        <button className="btn" onClick={onClose}>
          İptal
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

  const { data: templates } = useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => fetchCustomers({ page: 1, limit: 100, sort: 'name' }),
  });
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
    ((form.widthMm != null && form.widthMm > std.widthMm) ||
      (form.heightMm != null && form.heightMm > std.heightMm));

  const updateMut = useMutation({
    mutationFn: (input: UpdatePlateInput) => updatePlate(plate.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      onClose();
    },
  });
  const transferMut = useMutation({
    mutationFn: (input: TransferOwnershipInput) => transferPlateToBusiness(plate.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['plate-stock-levels', plate.id] });
    },
  });

  const customerName = (id?: string | null) =>
    customers?.items.find((c) => c.id === id)?.name ?? 'Müşteri';
  const consignmentLevels = (levels ?? []).filter(
    (l) => l.ownerCustomerId && Number(l.quantity) > 0,
  );

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-slate-200 p-2">
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
            {overSheet && (
              <p className="text-xs text-red-600">
                Kalan ebat standart tabaka ebadını ({std?.widthMm}×{std?.heightMm} mm) aşamaz.
              </p>
            )}
          </div>
        </Field>
      )}

      <div className="flex gap-2">
        <Field label="Eklenme tarihi" className="flex-1">
          <input
            className="input"
            type="date"
            value={form.addedAt ?? ''}
            onChange={(e) => setForm({ ...form, addedAt: e.target.value || undefined })}
          />
        </Field>
        <Field label="İşlenme tarihi" className="flex-1">
          <input
            className="input"
            type="date"
            value={form.processedAt ?? ''}
            onChange={(e) => setForm({ ...form, processedAt: e.target.value || undefined })}
          />
        </Field>
      </div>

      {consignmentLevels.length > 0 && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-2 text-sm">
          <p className="font-medium text-amber-800">Konsinye sahiplik</p>
          {consignmentLevels.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2">
              <span className="text-amber-900">
                {customerName(l.ownerCustomerId)} · {Number(l.quantity)} adet ·{' '}
                {l.warehouse?.name ?? 'depo'}
              </span>
              <button
                className="btn bg-amber-600 text-white"
                disabled={transferMut.isPending}
                onClick={() =>
                  transferMut.mutate({
                    ownerCustomerId: l.ownerCustomerId as string,
                    warehouseId: l.warehouseId,
                  })
                }
              >
                İşletmeye aktar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={overSheet || updateMut.isPending}
          onClick={() => updateMut.mutate(form)}
        >
          Kaydet
        </button>
        <button className="btn" onClick={onClose}>
          Kapat
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
  const [editingId, setEditingId] = useState<string | null>(null);

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
            const editing = editingId === plate.id;
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
                {(plate.addedAt || plate.processedAt) && (
                  <p className="mt-1 text-xs text-slate-400">
                    {plate.addedAt ? `Eklendi: ${plate.addedAt}` : ''}
                    {plate.processedAt
                      ? `${plate.addedAt ? ' · ' : ''}İşlendi: ${plate.processedAt}`
                      : ''}
                  </p>
                )}
                <div className="mt-2">
                  <button
                    className="btn"
                    onClick={() => setEditingId(editing ? null : plate.id)}
                  >
                    {editing ? 'Kapat' : 'Düzenle'}
                  </button>
                </div>
                {editing && (
                  <EditPlateForm plate={plate} onClose={() => setEditingId(null)} />
                )}
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
