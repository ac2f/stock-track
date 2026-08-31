/**
 * Katalog kayıtlarında (tür, marka, renk, ebat, kalınlık, şablon) "aynı kayıt"
 * kararının TEK yeri.
 *
 * Kullanıcı aynı şeyi farklı yazınca ("Dekota", "dekota", " Dekota ",
 * "DEKOTA") ayrı kayıtlar oluşuyor ve listeler çoğalıyordu. Karşılaştırma
 * her zaman normalize edilmiş ad üzerinden yapılır.
 */

/**
 * Bir adı karşılaştırılabilir anahtara çevirir: baştaki/sondaki boşluklar
 * atılır, aradaki boşluklar teke iner, Türkçe kurallarına göre küçültülür.
 * (İ/I ayrımı için `tr` yerel ayarı önemlidir: "İTHAL" → "ithal".)
 */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr');
}

/** Sayısal katalog değerleri (ebat/kalınlık) için anahtar — 2 hane yuvarlanır. */
export function normalizeNumber(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Ebat anahtarı: en×boy (sıra korunur, 3050×1560 ile 1560×3050 farklıdır). */
export function sizeKey(
  widthMm: number | string,
  heightMm: number | string,
): string {
  return `${normalizeNumber(widthMm)}x${normalizeNumber(heightMm)}`;
}

/**
 * Görüntülenecek adı düzenler: kenar boşlukları atılır, iç boşluklar teke iner.
 * Yazım (büyük/küçük harf) kullanıcının girdiği gibi korunur.
 */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
