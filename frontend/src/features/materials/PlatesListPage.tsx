import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  createPlate,
  depletePlate,
  fetchMaterialCategories,
  fetchMaterialTemplates,
  fetchPlateStockLevels,
  fetchPlates,
  transferPlateOwnership,
  updatePlate,
  type CreatePlateInput,
  type PlateFilters,
  type TransferOwnershipInput,
  type UpdatePlateInput,
} from '../../api/materials.api';
import { fetchWarehouses } from '../../api/warehouses.api';
import { fetchCustomers } from '../../api/customers.api';
import { RoleGate } from '../../components/RoleGate';
import { CustomerPicker } from '../../components/CustomerPicker';
import { SearchSelect } from '../../components/SearchSelect';
import { UnitConverter } from '../../components/UnitConverter';
import { GroupSection } from '../../components/GroupSection';
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
  const [nameTouched, setNameTouched] = useState(false);
  const [owner, setOwner] = useState<'business' | 'customer'>('business');

  const { data: templates } = useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: fetchWarehouses,
  });

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

      <Field label="Ürün türü (kategoriye göre gruplu · aratılabilir)">
        {/* #2 Kategoriye göre gruplu, aranabilir, klavyeyle gezilebilir seçici. */}
        <SearchSelect
          placeholder="Ürün türü ara / seç…"
          value={form.templateId}
          options={(templates ?? []).map((t) => ({
            id: t.id,
            label: t.name,
            group: t.category?.name ?? 'Diğer',
          }))}
          onChange={(id) => applyTemplateDefaults(id)}
        />
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

          {/* Metre (rulo/şerit) malzemede yükseklik + uzunluk girişi. */}
          {isLength && (
            <Field
              label="Rulo/şerit ölçüsü (yükseklik × uzunluk)"
              hint="Yükseklik mm cinsinden; uzunluk metre cinsinden stok miktarı olarak tutulur."
            >
              <div className="flex gap-2">
                <input
                  className="input"
                  type="number"
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
            <Field label="Sahip müşteri (ara)" hint="Sahibini aratıp seçin. Sahipliği sonradan işletmeye aktarabilirsiniz.">
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
            min={1}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      )}

      <div className="flex gap-2">
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
          {copies > 1 ? `${copies} plaka oluştur` : 'Kaydet'}
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
    ((form.widthMm != null && Number(form.widthMm) > Number(std.widthMm)) ||
      (form.heightMm != null && Number(form.heightMm) > Number(std.heightMm)));

  const [targets, setTargets] = useState<Record<string, string>>({});

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

  const customerName = (id?: string | null) =>
    customers?.items.find((c) => c.id === id)?.name ?? 'Müşteri';
  const activeLevels = (levels ?? []).filter((l) => Number(l.quantity) > 0);

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
                  {fromLabel} · {Number(l.quantity)} adet · {l.warehouse?.name ?? 'depo'}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">aktar →</span>
                  <select
                    className="input w-auto py-1"
                    value={target}
                    onChange={(e) =>
                      setTargets((t) => ({ ...t, [l.id]: e.target.value }))
                    }
                  >
                    <option value="business">İşletme</option>
                    {customers?.items
                      .filter((c) => c.id !== l.ownerCustomerId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn bg-blue-600 text-white"
                    disabled={
                      transferMut.isPending ||
                      (target === 'business' && !l.ownerCustomerId)
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

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={overSheet || updateMut.isPending}
          onClick={() => updateMut.mutate(form)}
        >
          Kaydet
        </button>
        <button
          className="btn bg-red-600 text-white"
          disabled={depleteMut.isPending}
          onClick={() => {
            if (
              confirm(
                'Bu plaka tamamen satıldı/bitti olarak stoktan çıkarılsın mı? (geri alınamaz)',
              )
            ) {
              depleteMut.mutate();
            }
          }}
        >
          Tamamını sat / stoktan çıkar
        </button>
        <button className="btn" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}

/** Tek plaka kartı — başlıkta tarih + dinamik sahip, kalan m² ve düzenleme. */
function PlateCard({ plate }: { plate: Plate }) {
  const [editing, setEditing] = useState(false);
  const m2 = areaM2(plate.widthMm, plate.heightMm);
  return (
    <div className="card">
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
        {m2 != null ? ` · kalan ${m2.toFixed(2)} m²` : ''}
      </p>
      {/* Başlık altı: dinamik sahip + stok/işlenme tarihi. */}
      <p className="mt-1 text-xs text-slate-400">
        Sahip: {plate.owners?.length ? plate.owners.join(', ') : '—'}
        {plate.addedAt ? ` · Stok: ${plate.addedAt}` : ''}
        {plate.processedAt ? ` · İşlendi: ${plate.processedAt}` : ''}
      </p>
      <div className="mt-2">
        <button className="btn" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Kapat' : 'Düzenle'}
        </button>
      </div>
      {editing && <EditPlateForm plate={plate} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** #4 Mini görünüm: tek satırda ad · kalan ebat · sahip · adet + düzenle. */
function PlateMiniRow({ plate }: { plate: Plate }) {
  const [editing, setEditing] = useState(false);
  const m2 = areaM2(plate.widthMm, plate.heightMm);
  return (
    <div className="bg-white px-3 py-2 text-sm dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-medium">{plate.name}</span>
          <span className="ml-2 text-xs text-slate-400">
            {plate.widthMm}×{plate.heightMm}
            {plate.thicknessMm ? `×${plate.thicknessMm}` : ''} mm
            {m2 != null ? ` · ${m2.toFixed(2)} m²` : ''}
            {' · '}
            {plate.owners?.length ? plate.owners.join(', ') : 'İşletme'}
          </span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            plate.quantityInStock > 0
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {plate.quantityInStock} adet
        </span>
        <button
          className="btn shrink-0 px-2 py-1 text-xs"
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
 * Plaka (stok) listesi + gelişmiş filtreleme.
 * Mobil: tek sütun kartlar; masaüstü: çok sütunlu ızgara.
 */
export function PlatesListPage() {
  const [filters, setFilters] = useState<PlateFilters>({ page: 1, limit: 20 });
  const [showForm, setShowForm] = useState(false);
  // Genel mini mod + gruplama ayarlarına uyar; sayfada geçici override edilebilir.
  const { mini: miniView, toggle: toggleMini } = useListDensity();
  const { grouped: groupByType, toggle: toggleGroup } = useListGrouping();

  const { data, isLoading } = useQuery({
    queryKey: ['plates', filters],
    queryFn: () => fetchPlates(filters),
  });
  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });
  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => fetchCustomers({ page: 1, limit: 100, sort: 'name' }),
  });

  const set = (patch: Partial<PlateFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  // #4 Sahip + kategori bazlı gruplama (müşteriye ait malzemeleri kolay bulmak için).
  const ownerOf = (p: Plate) => (p.owners?.length ? p.owners.join(', ') : 'İşletme');
  const groups = new Map<string, Plate[]>();
  for (const p of data?.items ?? []) {
    const key = `${ownerOf(p)} · ${p.template?.category?.name ?? 'Diğer'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const groupList = [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'tr'),
  );

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
          <select
            className="input w-auto"
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
            {customers?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex min-h-[44px] shrink-0 items-center gap-2 px-2 text-sm">
            <input
              type="checkbox"
              onChange={(e) => set({ inStock: e.target.checked || undefined })}
            />
            Stokta
          </label>
          <div className="flex min-h-[44px] shrink-0 items-center gap-2 px-2">
            <GroupToggle grouped={groupByType} onToggle={toggleGroup} />
            <DensityToggle mini={miniView} onToggle={toggleMini} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Stok tarihi (baş.)</span>
            <input
              className="input"
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => set({ from: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Stok tarihi (bit.)</span>
            <input
              className="input"
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => set({ to: e.target.value || undefined })}
            />
          </label>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : !data?.items.length ? (
        <p className="text-slate-400">Kayıt bulunamadı.</p>
      ) : groupByType ? (
        <div className="space-y-5">
          {groupList.map(([key, items]) => (
            <GroupSection key={key} title={key} count={items.length} countLabel="adet">
              {miniView ? (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {items.map((plate) => (
                    <PlateMiniRow key={plate.id} plate={plate} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((plate) => (
                    <PlateCard key={plate.id} plate={plate} />
                  ))}
                </div>
              )}
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
    </div>
  );
}
