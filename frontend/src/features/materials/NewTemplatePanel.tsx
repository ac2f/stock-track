import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ensureTemplate,
  fetchMaterialBrands,
  fetchMaterialColors,
  fetchMaterialSizes,
  fetchMaterialThicknesses,
  type EnsureTemplateResult,
} from '../../api/materials.api';
import { PickOrNew } from '../../components/ui/PickOrNew';
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

  // Kalınlık ve ebat metin olarak tutulur ("3," yazarken sayıya dönüp silinmesin);
  // taslak dışarıdan değişirse (aramadan yeniden çıkarılırsa) metin ona uyar.
  const parseNum = (s: string): number | undefined => {
    const n = Number(s.trim().replace(',', '.'));
    return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const sizeToText = (w?: number, h?: number) => (w && h ? `${w}x${h}` : '');
  const [thText, setThText] = useState(draft.thicknessMm != null ? String(draft.thicknessMm) : '');
  const [sizeText, setSizeText] = useState(sizeToText(draft.sheetWidthMm, draft.sheetHeightMm));
  useEffect(() => {
    if ((draft.thicknessMm ?? null) !== (parseNum(thText) ?? null)) {
      setThText(draft.thicknessMm != null ? String(draft.thicknessMm) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.thicknessMm]);
  useEffect(() => {
    const m = sizeText.toLowerCase().replace(/[×*]/g, 'x').match(/^\s*(\d{2,6})\s*x\s*(\d{2,6})\s*$/);
    const cur = m ? `${Number(m[1])}x${Number(m[2])}` : '';
    if (cur !== sizeToText(draft.sheetWidthMm, draft.sheetHeightMm)) {
      setSizeText(sizeToText(draft.sheetWidthMm, draft.sheetHeightMm));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.sheetWidthMm, draft.sheetHeightMm]);
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

  const { data: thicknesses } = useQuery({
    queryKey: ['material-thicknesses', category?.id],
    queryFn: () => fetchMaterialThicknesses(category!.id),
    enabled: !!category,
  });
  const { data: sizes } = useQuery({
    queryKey: ['material-sizes', category?.id],
    queryFn: () => fetchMaterialSizes(category!.id),
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

  // Aynı adda birden çok kodu olan renkler ayrı satırdır ("Beyaz · 1001", "Beyaz · 1002").
  const colorValue = (c: { id: string; name: string; code?: string }) => `${c.name}\u0000${c.code ?? ''}`;
  const colorOptions = (colors ?? []).map((c) => ({
    value: colorValue(c),
    label: c.code ? `${c.name} · ${c.code}` : c.name,
  }));
  // Taslaktaki ad(+kod) listedeki bir satırla eşleşiyorsa o satır seçili görünür.
  const sameName = (colors ?? []).filter((c) => fold(c.name) === fold(draft.colorName));
  const colorHit = sameName.find((c) => (c.code ?? '') === draft.colorCode.trim()) ?? sameName[0];
  const currentColorValue = colorHit ? colorValue(colorHit) : draft.colorName;

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Her alan önce mevcut kayıtların LİSTESİDİR; listede yoksa "➕ Yeni …" ile yazılır. */}
        <PickOrNew
          id="ntp-category"
          className="sm:col-span-2"
          label="Tür (kategori)"
          required
          options={(categories ?? []).map((c) => ({ value: c.name }))}
          loading={!categories}
          value={draft.categoryName}
          newLabel="Yeni tür yaz…"
          newPlaceholder="Örn. Pleksi"
          onChange={(v) => edit({ categoryName: v })}
        />

        <PickOrNew
          id="ntp-brand"
          label="Marka"
          options={(brands ?? []).map((b) => ({ value: b.name }))}
          loading={!!category && !brands}
          value={draft.brandName}
          placeholder={category ? 'Marka seçin…' : 'Önce tür seçin'}
          disabled={!draft.categoryName.trim()}
          newLabel="Yeni marka yaz…"
          newPlaceholder="Örn. Akpolimer"
          onChange={(v) => edit({ brandName: v })}
        />

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <PickOrNew
            id="ntp-color"
            label="Renk"
            options={colorOptions}
            loading={!!category && !colors}
            value={currentColorValue}
            placeholder={category ? 'Renk seçin…' : 'Önce tür seçin'}
            disabled={!draft.categoryName.trim()}
            newLabel="Yeni renk yaz…"
            newPlaceholder="Örn. Beyaz"
            onChange={(v) => {
              // Listeden seçilen rengin kodu da gelir (aynı adda birden çok kod olabilir: "Beyaz · 1001").
              const hit = (colors ?? []).find((c) => colorValue(c) === v);
              if (hit) edit({ colorName: hit.name, colorCode: hit.code ?? '' });
              else edit({ colorName: v });
            }}
          />
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

        <PickOrNew
          id="ntp-thickness"
          label="Kalınlık (mm)"
          options={(thicknesses ?? []).map((x) => ({ value: String(Number(x.valueMm)), label: `${Number(x.valueMm)} mm` }))}
          loading={!!category && !thicknesses}
          value={thText}
          placeholder="Kalınlık seçin…"
          disabled={!draft.categoryName.trim()}
          newLabel="Başka kalınlık yaz…"
          newPlaceholder="mm (örn. 3)"
          onChange={(v) => {
            setThText(v);
            edit({ thicknessMm: parseNum(v) });
          }}
        />

        <PickOrNew
          id="ntp-size"
          label="Standart tabaka ebadı (en × boy mm)"
          options={(sizes ?? []).map((s) => ({ value: `${Number(s.widthMm)}x${Number(s.heightMm)}`, label: `${Number(s.widthMm)} × ${Number(s.heightMm)} mm` }))}
          loading={!!category && !sizes}
          value={sizeText}
          placeholder="Ebat seçin…"
          disabled={!draft.categoryName.trim()}
          newLabel="Başka ebat yaz…"
          newPlaceholder="1220x2440"
          onChange={(v) => {
            setSizeText(v);
            const m = v.toLowerCase().replace(/[×*]/g, 'x').match(/^\s*(\d{2,6})\s*x\s*(\d{2,6})\s*$/);
            edit(m ? { sheetWidthMm: Number(m[1]), sheetHeightMm: Number(m[2]) } : { sheetWidthMm: undefined, sheetHeightMm: undefined });
          }}
        />

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
