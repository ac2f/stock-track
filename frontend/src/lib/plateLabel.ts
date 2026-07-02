import type { PlateBrief } from '../types';

/** Kalan (kesilmiş) m² — yalnızca tabaka (AREA) malzemede anlamlı. */
export function plateRemainingM2(plate: Pick<PlateBrief, 'widthMm' | 'heightMm'>): number | null {
  const w = Number(plate.widthMm);
  const h = Number(plate.heightMm);
  if (!w || !h) return null;
  return (w / 1000) * (h / 1000);
}

/**
 * Tabaka malzemenin kalan ebat bilgisi: "Kalan: 1350x1000 1.35m²".
 * AREA dışı tip veya ebat yoksa null döner.
 */
export function plateRemainingLabel(
  plate: Pick<PlateBrief, 'measurementType' | 'widthMm' | 'heightMm'>,
): string | null {
  if (plate.measurementType && plate.measurementType !== 'area') return null;
  const m2 = plateRemainingM2(plate);
  if (m2 == null) return null;
  return `Kalan: ${Number(plate.widthMm)}x${Number(plate.heightMm)} ${m2.toFixed(2)}m²`;
}

/**
 * Liste/açılır menüde tek satırlık plaka etiketi:
 * "Pleksi[XXXX] 2.8x1350x2000 · Kalan: 1350x1000 1.35m²".
 * Kalan ebat hesaplanamazsa yalnızca ad döner.
 */
export function plateLabel(plate: PlateBrief): string {
  const rem = plateRemainingLabel(plate);
  return rem ? `${plate.name} · ${rem}` : plate.name;
}

/**
 * Tabaka KESİLMİŞ mi? (kalan ebat, türün standart tabaka ebadından küçük)
 * Şerit/rulo (AREA dışı) veya standart ebat tanımsızsa false — vurgulanmaz.
 */
export function isPartialSheet(
  plate: Pick<PlateBrief, 'measurementType' | 'widthMm' | 'heightMm' | 'template'>,
): boolean {
  if (plate.measurementType && plate.measurementType !== 'area') return false;
  const std = plate.template?.defaultSize;
  if (!std) return false;
  const w = Number(plate.widthMm);
  const h = Number(plate.heightMm);
  if (!w || !h) return false;
  return w < Number(std.widthMm) || h < Number(std.heightMm);
}
