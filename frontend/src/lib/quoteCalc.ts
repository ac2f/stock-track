import type { MeasurementType, Plate, QuoteItemInput } from '../types';

/**
 * Backend `computeQuantityValue` ile aynı: m² = en×boy×adet, metre =
 * uzunluk×adet, saat = süre(dk)/60 (adetle çarpılmaz), diğer = adet.
 */
function quantityValue(
  unit: MeasurementType,
  quantity: number,
  widthMm?: number | null,
  heightMm?: number | null,
  lengthMeters?: number | null,
  minutes?: number | null,
): number | null {
  if (unit === 'time') {
    if (minutes == null) return null;
    return minutes / 60;
  }
  if (unit === 'area') {
    if (!widthMm || !heightMm) return null;
    return (Number(widthMm) / 1000) * (Number(heightMm) / 1000) * quantity;
  }
  if (unit === 'length') {
    if (!lengthMeters) return null;
    return Number(lengthMeters) * quantity;
  }
  return quantity;
}

export interface LinePreview {
  unit: MeasurementType;
  measure: number | null; // m² / metre / adet / saat
  lineTotal: number;
  /** Süreyle kalemde faturalanacak dakika (asgari süre uygulanmış). */
  billedMinutes?: number | null;
}

/** Süreyle işte faturalanan süre: girilen süre ile asgari sürenin büyüğü. */
export function billedMinutes(
  minutes: number | null | undefined,
  minMinutes: number | null | undefined,
): number | null {
  if (minutes == null || Number.isNaN(Number(minutes))) return null;
  return Math.max(Number(minutes), Number(minMinutes) || 0);
}

/**
 * Bir teklif kaleminin tahmini ölçüsünü ve satır tutarını hesaplar (teklif henüz
 * oluşturulmadan canlı önizleme için) — backend `computeLineTotal` ile aynı kural:
 * birim fiyat ölçü birimine (m²/metre/adet) uygulanır. m² seçili ama ebat yoksa
 * adet bazına düşülür.
 */
export function quoteLinePreview(
  item: QuoteItemInput,
  plate: Plate | undefined,
  minMinutes = 0,
): LinePreview {
  const unit: MeasurementType =
    item.billingUnit ?? plate?.measurementType ?? 'piece';
  const price = Number(item.unitPrice) || 0;
  // Süre: birim fiyat saatlik; sunucu da aynı asgari süreyi uygular.
  if (unit === 'time') {
    const billed = billedMinutes(item.durationMinutes, minMinutes);
    const measure = quantityValue('time', 0, null, null, null, billed);
    return {
      unit,
      measure,
      billedMinutes: billed,
      lineTotal: measure == null ? 0 : round2(measure * price),
    };
  }
  const widthMm = item.widthMm ?? plate?.widthMm ?? null;
  const heightMm = item.heightMm ?? plate?.heightMm ?? null;
  const qty = Number(item.quantity) || 0;

  // m² seçili ama ebat yoksa → adet bazına düş (güvenli geri dönüş).
  if (unit === 'area' && (!widthMm || !heightMm)) {
    return { unit, measure: qty, lineTotal: round2(qty * price) };
  }
  // Metre (şerit/rulo) SATIŞINDA metre quantity'de taşınır: lengthMeters yoksa
  // quantity'yi metre kabul et (backend computeLineTotal ile aynı kural).
  if (unit === 'length' && !item.lengthMeters) {
    return { unit, measure: qty, lineTotal: round2(qty * price) };
  }
  const measure = quantityValue(unit, qty, widthMm, heightMm, item.lengthMeters);
  const lineTotal = measure == null ? 0 : round2(measure * price);
  return { unit, measure, lineTotal };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const UNIT_LABEL: Record<MeasurementType, string> = {
  area: 'm²',
  length: 'm',
  piece: 'adet',
  weight: 'kg',
  time: 'saat',
};
