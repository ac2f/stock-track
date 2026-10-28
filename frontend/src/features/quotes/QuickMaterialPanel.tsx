import { useState } from 'react';
import { TemplateFinder } from '../materials/TemplateFinder';
import { SelectedCard } from '../../components/ui/SelectedCard';
import { useMaterialTemplates } from '../../hooks/useReferenceData';
import { stripNamePlaceholders } from '../../lib/plateLabel';
import { formatDate } from '../../lib/format';
import type { MeasurementType, NewMaterialInput } from '../../types';

/** Formda gösterilen özetli taslak: kayıt sırasında `NewMaterialInput` olarak gider. */
export interface NewMaterialDraft extends NewMaterialInput {
  /** Kalemde ve özette görünen ad (ürün türünün adı). */
  label: string;
  measurementType: MeasurementType;
  /** "Müşterinin malı: Ali" / "İşletme stoğu" — özet satırı için. */
  ownerLabel: string;
}

/** Taslağı API'ye gidecek biçime çevirir (arayüz alanları atılır). */
export function draftToInput(d: NewMaterialDraft): NewMaterialInput {
  return {
    templateId: d.templateId,
    widthMm: d.widthMm,
    heightMm: d.heightMm,
    quantityInStock: d.quantityInStock,
    ownerCustomerId: d.ownerCustomerId,
    addedAt: d.addedAt,
    warehouseId: d.warehouseId,
  };
}

/** Taslağın tek satırlık özeti. */
export function draftSummary(d: NewMaterialDraft): string {
  const dims =
    d.measurementType === 'area' && d.widthMm && d.heightMm
      ? `${d.widthMm}×${d.heightMm} mm`
      : d.measurementType === 'length' && d.quantityInStock
        ? `${d.quantityInStock} m`
        : d.quantityInStock && d.measurementType !== 'area'
          ? `${d.quantityInStock} adet`
          : '';
  return [
    dims,
    d.addedAt ? `geliş ${formatDate(d.addedAt)}` : '',
    d.ownerLabel,
    'teklif kaydedilince stoğa eklenir',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Teklif içinde "yeni malzeme": stokta olmayan (ya da müşterinin X tarihinde
 * getirdiği) malzemeyi ürün türü + ebat + geliş tarihiyle tanımlar. Ürün türü
 * yoksa aramadan kaydedilir. Teklif kaydedilirken malzeme aynı işlemde stoğa
 * eklenir ve kalemin plakası olur; stoğa önceden ayrıca giriş yapmak gerekmez.
 */
export function QuickMaterialPanel({
  buyerId,
  buyerName,
  defaultDate,
  defaultOwner = 'customer',
  initial,
  onSave,
  onCancel,
}: {
  buyerId: string;
  buyerName: string;
  /** Geliş tarihi önerisi (genelde teklif tarihi), YYYY-MM-DD. */
  defaultDate: string;
  /** Sahiplik önerisi: işleme için müşterinin malı, satış için işletme stoğu. */
  defaultOwner?: 'customer' | 'business';
  initial?: NewMaterialDraft;
  onSave: (draft: NewMaterialDraft) => void;
  onCancel: () => void;
}) {
  const { data: templates } = useMaterialTemplates();
  const [templateId, setTemplateId] = useState(initial?.templateId ?? '');
  const [picking, setPicking] = useState(!initial);
  const [owner, setOwner] = useState<'customer' | 'business'>(
    initial ? (initial.ownerCustomerId ? 'customer' : 'business') : buyerId ? defaultOwner : 'business',
  );
  const [addedAt, setAddedAt] = useState(initial?.addedAt ?? defaultDate);
  const [widthMm, setWidthMm] = useState<number | undefined>(initial?.widthMm);
  const [heightMm, setHeightMm] = useState<number | undefined>(initial?.heightMm);
  const [qty, setQty] = useState<number | undefined>(initial?.quantityInStock);

  const tpl = templates?.find((t) => t.id === templateId);
  const mt = (tpl?.measurementType ?? initial?.measurementType ?? 'area') as MeasurementType;
  const std = tpl?.defaultSize;
  const overSheet =
    mt === 'area' &&
    !!std &&
    ((widthMm != null && widthMm > Number(std.widthMm)) || (heightMm != null && heightMm > Number(std.heightMm)));

  const choose = (id: string, known?: typeof tpl) => {
    const t = known ?? templates?.find((x) => x.id === id);
    setTemplateId(id);
    setPicking(false);
    // Standart ebat önerilir; "işe özel" küçük ebat (100×200 gibi) elle yazılır.
    setWidthMm(t?.defaultSize ? Number(t.defaultSize.widthMm) : undefined);
    setHeightMm(t?.defaultSize ? Number(t.defaultSize.heightMm) : undefined);
    setQty(undefined);
  };

  const ready =
    !!tpl &&
    !overSheet &&
    (mt !== 'area' || (!!widthMm && !!heightMm)) &&
    (mt === 'area' || !!qty) &&
    !(owner === 'customer' && !buyerId);

  const num = (v: string) => (v ? Number(v) : undefined);

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 p-3 dark:border-emerald-700 dark:bg-emerald-950/20">
      <div>
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          ➕ Yeni malzeme (stoğa eklenir)
        </p>
        <p className="text-xs text-slate-500">
          Stokta olmayan ya da müşterinin getirdiği malzemeyi burada tanımlayın; teklif kaydedilince
          belirttiğiniz geliş tarihiyle stoğa girer ve bu kalemde kullanılır.
        </p>
      </div>

      <div className="min-w-0">
        <span className="label">
          Ürün türü<span className="ml-0.5 text-red-600">*</span>
        </span>
        {tpl && !picking ? (
          <SelectedCard
            title={stripNamePlaceholders(tpl.name) || tpl.name}
            subtitle={tpl.category?.name}
            titleHint="Başka ürün türü seçmek için karta tıklayın"
            onChange={() => setPicking(true)}
          />
        ) : (
          <TemplateFinder
            templates={templates ?? []}
            selectedId={templateId}
            onPick={(id) => choose(id)}
            onCreated={(res) => choose(res.template.id, res.template)}
            createLabel="Ürün türünü kaydet ve kullan"
            createHint="Aradığınız ürün türü kayıtlı değil. Alanlar aramanızdan dolduruldu; kaydedince bu malzemede kullanılır."
          />
        )}
      </div>

      {tpl && (
        <>
          {mt === 'area' && (
            <div className="space-y-1">
              <span className="label">Ebat (en × boy, mm)</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="En (mm)"
                  value={widthMm ?? ''}
                  onChange={(e) => setWidthMm(num(e.target.value))}
                  aria-label="En (mm)"
                />
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Boy (mm)"
                  value={heightMm ?? ''}
                  onChange={(e) => setHeightMm(num(e.target.value))}
                  aria-label="Boy (mm)"
                />
              </div>
              {overSheet ? (
                <p className="text-xs text-red-600">
                  Ebat standart tabaka ebadını ({std?.widthMm}×{std?.heightMm} mm) aşamaz.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {std
                    ? `Standart tabaka ${std.widthMm}×${std.heightMm} mm. İşe özel parça için küçük ebat yazın (ör. 100×200).`
                    : 'Bu parçanın ebadı.'}
                </p>
              )}
            </div>
          )}
          {mt === 'length' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="label">Yükseklik (mm)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={heightMm ?? ''}
                  onChange={(e) => setHeightMm(num(e.target.value))}
                />
              </label>
              <label className="block min-w-0">
                <span className="label">Uzunluk (metre)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={qty ?? ''}
                  onChange={(e) => setQty(num(e.target.value))}
                />
              </label>
            </div>
          )}
          {(mt === 'piece' || mt === 'weight') && (
            <label className="block min-w-0 max-w-[10rem]">
              <span className="label">Adet</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                value={qty ?? ''}
                onChange={(e) => setQty(num(e.target.value))}
              />
            </label>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="label">Malzemenin geliş tarihi</span>
              <input
                className="input"
                type="date"
                value={addedAt}
                onChange={(e) => setAddedAt(e.target.value)}
              />
            </label>
            <div className="min-w-0">
              <span className="label">Sahiplik</span>
              <div className="flex flex-wrap gap-1 text-sm" role="radiogroup" aria-label="Sahiplik">
                {(
                  [
                    ['customer', buyerName ? `Müşterinin malı (${buyerName})` : 'Müşterinin malı'],
                    ['business', 'İşletme stoğu'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={owner === v}
                    disabled={v === 'customer' && !buyerId}
                    onClick={() => setOwner(v)}
                    className={`min-h-[40px] flex-1 rounded-lg px-3 text-xs font-medium disabled:opacity-40 ${
                      owner === v
                        ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-success"
          disabled={!ready}
          onClick={() =>
            tpl &&
            onSave({
              templateId: tpl.id,
              label: stripNamePlaceholders(tpl.name) || tpl.name,
              measurementType: mt,
              widthMm: mt === 'area' ? widthMm : undefined,
              heightMm: mt === 'area' || mt === 'length' ? heightMm : undefined,
              quantityInStock: mt === 'area' ? 1 : qty,
              ownerCustomerId: owner === 'customer' && buyerId ? buyerId : undefined,
              ownerLabel: owner === 'customer' ? `müşterinin malı${buyerName ? ` (${buyerName})` : ''}` : 'işletme stoğu',
              addedAt: addedAt || undefined,
            })
          }
        >
          Malzemeyi ekle
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}
