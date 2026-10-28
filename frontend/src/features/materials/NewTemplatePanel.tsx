import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ensureTemplate,
  fetchMaterialBrands,
  fetchMaterialColors,
  type EnsureTemplateResult,
} from '../../api/materials.api';
import { useMaterialCategories } from '../../hooks/useReferenceData';
import { fold } from '../../lib/search';
import { parseTemplateQuery, type TemplateDraft } from '../../lib/templateDraft';
import { Spinner } from '../../components/ui/Loading';
import type { MaterialTemplate } from '../../types';

/**
 * "Bu ürün türü yok" paneli: aranan metinden (yazım hatası, sıra, Türkçe
 * karakter fark etmez) bir TASLAK çıkarır ve alanları DOLU açar; kullanıcı
 * kontrol edip kaydeder. Tür, marka, renk, kalınlık, ebat kataloğunda yoksa
 * kaydederken kendiliğinden açılır; aynı özellikte bir ürün türü zaten varsa
 * o kullanılır (kopya açılmaz).
 */
export function NewTemplatePanel({
  query,
  onCreated,
  onCancel,
  submitLabel = 'Ürün türünü kaydet',
  hint,
}: {
  /** Aranan metin: alanları doldurmak için kullanılır. */
  query: string;
  onCreated: (result: EnsureTemplateResult) => void;
  onCancel: () => void;
  submitLabel?: string;
  /** Başlığın altında bağlama özgü kısa açıklama. */
  hint?: string;
}) {
  const qc = useQueryClient();
  const { data: categories } = useMaterialCategories();
  const [draft, setDraft] = useState<TemplateDraft>(() =>
    parseTemplateQuery(query, { categories: [] }),
  );
  // Kullanıcı bir alana dokunduysa taslak, katalog geldiğinde bozulmaz.
  const touched = useRef(false);
  const edit = (patch: Partial<TemplateDraft>) => {
    touched.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };

  // Kategoriler gelince taslağı yeniden çıkar (kategori adı eşleşsin).
  const catNames = useMemo(() => (categories ?? []).map((c) => ({ name: c.name })), [categories]);
  useEffect(() => {
    if (!categories || touched.current) return;
    setDraft(parseTemplateQuery(query, { categories: catNames }));
  }, [categories, catNames, query]);

  const category = categories?.find((c) => fold(c.name) === fold(draft.categoryName));
  const { data: brands } = useQuery({
    queryKey: ['material-brands', category?.id],
    queryFn: () => fetchMaterialBrands(category!.id),
    enabled: !!category,
  });
  const { data: colors } = useQuery({
    queryKey: ['material-colors', category?.id],
    queryFn: () => fetchMaterialColors(category!.id),
    enabled: !!category,
  });

  // Marka/renk listesi gelince yazımı kataloğa düzelt (yalnız dokunulmadıysa).
  useEffect(() => {
    if (!category || !brands || !colors || touched.current) return;
    setDraft(
      parseTemplateQuery(query, {
        categories: catNames,
        brands: brands.map((b) => b.name),
        colors: colors.map((c) => c.name),
      }),
    );
  }, [category, brands, colors, catNames, query]);

  const mut = useMutation({
    mutationFn: () =>
      ensureTemplate({
        categoryName: draft.categoryName.trim(),
        brandName: draft.brandName.trim() || undefined,
        colorName: draft.colorName.trim() || undefined,
        colorCode: draft.colorCode.trim() || undefined,
        thicknessMm: draft.thicknessMm,
        sheetWidthMm: draft.sheetWidthMm,
        sheetHeightMm: draft.sheetHeightMm,
        variant: draft.variant.trim() || undefined,
        measurementType: category?.defaultMeasurementType,
      }),
    onSuccess: (res) => {
      // Yeni tür listeye HEMEN eklenir (form onu hemen seçebilsin); ardından
      // sunucudan tazelenir.
      qc.setQueryData<MaterialTemplate[]>(['material-templates'], (old) =>
        old && !old.some((t) => t.id === res.template.id) ? [...old, res.template] : old,
      );
      // Yeni açılan katalog kayıtları ve tür listeleri tazelensin.
      for (const key of [
        'material-templates',
        'material-categories',
        'material-brands',
        'material-colors',
        'material-sizes',
        'material-thicknesses',
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      onCreated(res);
    },
  });

  const num = (v: string) => (v ? Number(v) : undefined);
  const preview = [
    draft.categoryName.trim(),
    draft.brandName.trim(),
    draft.colorName.trim(),
    draft.thicknessMm != null ? `${draft.thicknessMm}mm` : '',
    draft.variant.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  // Kataloğa YENİ eklenecekler (kullanıcı görsün).
  const brandIsNew =
    !!draft.brandName.trim() && !!category && !!brands && !brands.some((b) => fold(b.name) === fold(draft.brandName));
  const colorIsNew =
    !!draft.colorName.trim() && !!category && !!colors && !colors.some((c) => fold(c.name) === fold(draft.colorName));
  const newThings = [
    draft.categoryName.trim() && !category && categories ? `tür “${draft.categoryName.trim()}”` : '',
    brandIsNew ? `marka “${draft.brandName.trim()}”` : '',
    colorIsNew ? `renk “${draft.colorName.trim()}”` : '',
  ].filter(Boolean);

  const canSave = !!draft.categoryName.trim() && !mut.isPending;

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
      <div>
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
          ➕ Yeni ürün türü{query.trim() ? ` — “${query.trim()}”` : ''}
        </p>
        <p className="text-xs text-slate-500">
          {hint ?? 'Alanlar aramanızdan dolduruldu; kontrol edip kaydedin.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block min-w-0 sm:col-span-2">
          <span className="label">
            Tür (kategori)<span className="ml-0.5 text-red-600">*</span>
          </span>
          <input
            className="input"
            list="ntp-categories"
            placeholder="Örn. Pleksi"
            value={draft.categoryName}
            onChange={(e) => edit({ categoryName: e.target.value })}
            autoComplete="off"
          />
          <datalist id="ntp-categories">
            {categories?.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>

        <label className="block min-w-0">
          <span className="label">Marka</span>
          <input
            className="input"
            list="ntp-brands"
            placeholder="Örn. Akpolimer"
            value={draft.brandName}
            onChange={(e) => edit({ brandName: e.target.value })}
            autoComplete="off"
          />
          <datalist id="ntp-brands">
            {brands?.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
        </label>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className="block min-w-0">
            <span className="label">Renk</span>
            <input
              className="input"
              list="ntp-colors"
              placeholder="Örn. Beyaz"
              value={draft.colorName}
              onChange={(e) => edit({ colorName: e.target.value })}
              autoComplete="off"
            />
            <datalist id="ntp-colors">
              {[...new Set((colors ?? []).map((c) => c.name))].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className="block min-w-0">
            <span className="label">Kod</span>
            <input
              className="input font-mono"
              placeholder="1001"
              value={draft.colorCode}
              onChange={(e) => edit({ colorCode: e.target.value })}
            />
          </label>
        </div>

        <label className="block min-w-0">
          <span className="label">Kalınlık (mm)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={draft.thicknessMm ?? ''}
            onChange={(e) => edit({ thicknessMm: num(e.target.value) })}
          />
        </label>

        <div className="grid min-w-0 grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className="label">Standart en (mm)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.sheetWidthMm ?? ''}
              onChange={(e) => edit({ sheetWidthMm: num(e.target.value) })}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">Standart boy (mm)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.sheetHeightMm ?? ''}
              onChange={(e) => edit({ sheetHeightMm: num(e.target.value) })}
            />
          </label>
        </div>

        <label className="block min-w-0 sm:col-span-2">
          <span className="label">Alt tür / varyant (ops.)</span>
          <input
            className="input"
            placeholder="Örn. Dökme / Çekme"
            value={draft.variant}
            onChange={(e) => edit({ variant: e.target.value })}
          />
        </label>
      </div>

      {draft.leftover.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Yerleştirilemeyen sözcükler: {draft.leftover.join(', ')} — gerekiyorsa ilgili alana yazın.
        </p>
      )}
      <p className="rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
        <span className="text-xs text-slate-500">Oluşacak ürün türü: </span>
        <b>{preview || '—'}</b>
        {newThings.length > 0 && (
          <span className="mt-0.5 block text-xs text-blue-700 dark:text-blue-300">
            Kataloğa yeni eklenecek: {newThings.join(', ')}
          </span>
        )}
      </p>

      {mut.isError && (
        <p role="alert" className="text-sm text-red-600">
          {(mut.error as { response?: { data?: { message?: string | string[] } } })?.response?.data
            ?.message?.toString() ?? 'Ürün türü kaydedilemedi.'}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!canSave} onClick={() => mut.mutate()}>
          {mut.isPending && <Spinner />}
          {submitLabel}
        </button>
        <button type="button" className="btn-secondary" disabled={mut.isPending} onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}
