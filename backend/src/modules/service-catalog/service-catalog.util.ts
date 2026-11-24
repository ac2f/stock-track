/**
 * Hizmet kataloğunun saf kuralları (veritabanından bağımsız, sınanabilir):
 * ölçüye göre kademe seçimi ve kombinasyon indirimi.
 */

export interface TierLike {
  id: string;
  minMeasure?: number | null;
  maxMeasure?: number | null;
  sortOrder?: number;
}

/**
 * Ölçüye uyan kademe: [min, max) aralığında (alt sınır dahil, üst hariç; boş sınır açık).
 * Ölçü verilmezse ilk kademe; uyan yoksa null.
 */
export function pickTier<T extends TierLike>(tiers: T[], measure?: number | null): T | null {
  const sorted = [...tiers].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.minMeasure ?? -Infinity) - (b.minMeasure ?? -Infinity),
  );
  if (measure == null || !Number.isFinite(measure)) return sorted[0] ?? null;
  return (
    sorted.find(
      (t) => (t.minMeasure == null || measure >= Number(t.minMeasure)) && (t.maxMeasure == null || measure < Number(t.maxMeasure)),
    ) ?? null
  );
}

export interface BundleLike {
  id: string;
  name: string;
  serviceTypeIds: string[];
  discountKind: 'percent' | 'fixed';
  discountValue: number;
  isActive?: boolean;
}

export interface ServiceLine {
  serviceTypeId?: string | null;
  lineTotal: number;
}

export interface BundleDiscount<B> {
  bundle: B;
  /** Paketteki hizmetlerin teklifteki toplamı (indirimin uygulandığı tutar). */
  base: number;
  amount: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Teklifteki hizmetlere uyan en büyük kombinasyon indirimi: paketteki hizmet türlerinin hepsi (en az iki)
 * teklifte olmalı. Yüzde indirim paketteki hizmetlerin toplamına uygulanır; sabit indirim o toplamı aşmaz.
 */
export function bestBundle<B extends BundleLike>(bundles: B[], lines: ServiceLine[]): BundleDiscount<B> | null {
  const present = new Set(lines.map((l) => l.serviceTypeId).filter((x): x is string => !!x));
  let best: BundleDiscount<B> | null = null;
  for (const b of bundles) {
    if (b.isActive === false) continue;
    const ids = [...new Set(b.serviceTypeIds ?? [])];
    if (ids.length < 2 || !ids.every((id) => present.has(id))) continue;
    const base = round2(lines.filter((l) => l.serviceTypeId && ids.includes(l.serviceTypeId)).reduce((s, l) => s + Number(l.lineTotal), 0));
    if (base <= 0) continue;
    const v = Number(b.discountValue) || 0;
    const amount = round2(b.discountKind === 'percent' ? (base * Math.min(100, Math.max(0, v))) / 100 : Math.min(base, Math.max(0, v)));
    if (amount > 0 && (!best || amount > best.amount)) best = { bundle: b, base, amount };
  }
  return best;
}

/** Belgedeki indirim satırının metni: "Kombinasyon indirimi — Harf paketi (%10)". */
export function bundleLabel(b: BundleLike): string {
  const v = Number(b.discountValue);
  const how = b.discountKind === 'percent' ? `%${v % 1 ? v.toFixed(2) : v}` : 'sabit';
  return `Kombinasyon indirimi — ${b.name} (${how})`;
}
