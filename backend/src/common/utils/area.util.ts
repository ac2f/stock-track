/**
 * Geometri & maliyet için saf (yan etkisiz) yardımcı fonksiyonlar.
 * Domain mantığı çerçeveden bağımsız, kolayca test edilebilir.
 */

/** Milimetre cinsinden en/boy'u metrekareye çevirir. */
export function mmToSquareMeters(widthMm: number, heightMm: number): number {
  if (widthMm <= 0 || heightMm <= 0) {
    throw new Error('En ve boy pozitif olmalıdır.');
  }
  return (widthMm / 1000) * (heightMm / 1000);
}

/** Belirli adet için toplam alanı (m²) hesaplar. */
export function totalAreaM2(
  widthMm: number,
  heightMm: number,
  quantity: number,
): number {
  if (quantity <= 0) {
    throw new Error('Adet pozitif olmalıdır.');
  }
  return round(mmToSquareMeters(widthMm, heightMm) * quantity, 4);
}

/** Para birimi alanlarını 2 ondalığa yuvarlar (kayan nokta hatalarını önler). */
export function roundMoney(value: number): number {
  return round(value, 2);
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
