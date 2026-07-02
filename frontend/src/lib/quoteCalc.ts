import type { MeasurementType, Plate, QuoteItemInput } from '../types';

/** Backend `computeQuantityValue` ile aynı: m² = en×boy×adet, metre = uzunluk×adet, diğer = adet. */
function quantityValue(
  unit: MeasurementType,
  quantity: number,
  widthMm?: number | null,
  heightMm?: number | null,
  lengthMeters?: number | null,
): number | null {
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
  measure: number | null; // m² / metre / adet
  lineTotal: number;
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
): LinePreview {
  const unit: MeasurementType =
    item.billingUnit ?? plate?.measurementType ?? 'piece';
  const widthMm = item.widthMm ?? plate?.widthMm ?? null;
  const heightMm = item.heightMm ?? plate?.heightMm ?? null;
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unitPrice) || 0;

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
};
