import type { MeasurementType } from '../types';
import type { ServiceBundle, ServiceTier } from '../api/services.api';

/**
 * Hizmet kataloğunun ön yüz kuralları (sunucudaki service-catalog.util.ts ile aynı): ölçüye göre
 * kademe ve kombinasyon indirimi. Teklif formu kaydetmeden önce aynı sonucu gösterir.
 */

/** Ölçüye uyan kademe: [min, max) — alt sınır dahil, üst hariç; ölçü yoksa ilk kademe. */
export function pickTier(tiers: ServiceTier[], measure?: number | null): ServiceTier | null {
  const sorted = [...tiers].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.minMeasure ?? -Infinity) - (b.minMeasure ?? -Infinity),
  );
  if (measure == null || !Number.isFinite(measure)) return sorted[0] ?? null;
  return (
    sorted.find(
      (t) => (t.minMeasure == null || measure >= Number(t.minMeasure)) && (t.maxMeasure == null || measure < Number(t.maxMeasure)),
    ) ?? null
  );
}

export interface BundleHit {
  bundle: ServiceBundle;
  base: number;
  amount: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Teklifteki hizmetlere uyan en büyük kombinasyon indirimi (paketteki hizmetlerin hepsi, en az iki). */
export function bestBundle(bundles: ServiceBundle[], lines: { serviceTypeId?: string | null; lineTotal: number }[]): BundleHit | null {
  const present = new Set(lines.map((l) => l.serviceTypeId).filter((x): x is string => !!x));
  let best: BundleHit | null = null;
  for (const b of bundles) {
    if (!b.isActive) continue;
    const ids = [...new Set(b.serviceTypeIds)];
    if (ids.length < 2 || !ids.every((id) => present.has(id))) continue;
    const base = round2(lines.filter((l) => l.serviceTypeId && ids.includes(l.serviceTypeId)).reduce((s, l) => s + l.lineTotal, 0));
    if (base <= 0) continue;
    const v = Number(b.discountValue) || 0;
    const amount = round2(b.discountKind === 'percent' ? (base * Math.min(100, Math.max(0, v))) / 100 : Math.min(base, Math.max(0, v)));
    if (amount > 0 && (!best || amount > best.amount)) best = { bundle: b, base, amount };
  }
  return best;
}

/** İndirim satırının metni (sunucudaki bundleLabel ile aynı). */
export function bundleLabel(b: ServiceBundle): string {
  const v = Number(b.discountValue);
  const how = b.discountKind === 'percent' ? `%${v % 1 ? v.toFixed(2) : v}` : 'sabit';
  return `Kombinasyon indirimi — ${b.name} (${how})`;
}

export const UNIT_SHORT: Record<MeasurementType, string> = {
  area: 'm²',
  length: 'metre',
  piece: 'adet',
  weight: 'kg',
  time: 'saat',
};

/** Kademenin ölçü aralığı: "10 cm altı", "10–30", "30 ve üstü" (birim adı verilirse sonuna). */
export function tierRange(t: Pick<ServiceTier, 'minMeasure' | 'maxMeasure'>, unit = ''): string {
  const u = unit ? ` ${unit}` : '';
  if (t.minMeasure == null && t.maxMeasure == null) return 'her ölçü';
  if (t.minMeasure == null) return `${Number(t.maxMeasure)}${u} altı`;
  if (t.maxMeasure == null) return `${Number(t.minMeasure)}${u} ve üstü`;
  return `${Number(t.minMeasure)}–${Number(t.maxMeasure)}${u}`;
}
