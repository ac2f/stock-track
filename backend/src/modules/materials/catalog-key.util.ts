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

/** Ürün türünün (şablon) kimliğini belirleyen alanlar. */
export interface TemplateKeyFields {
  categoryId: string;
  name?: string | null;
  defaultBrandId?: string | null;
  defaultColorId?: string | null;
  defaultSizeId?: string | null;
  defaultThicknessId?: string | null;
  defaultVariant?: string | null;
}

/**
 * Ürün türü anahtarı: aynı anahtarlı iki tür AYNI üründür, ikincisi açılmaz.
 *
 * Anahtar kategori + marka + renk + ebat + kalınlık + alt türdür; ad
 * sayılmaz (aynı özellikte "Pleksi Beyaz 3mm" ile "Beyaz Pleksi 3 mm" aynı
 * şeydir). Hiç özelliği seçilmemiş türlerde ayırt edici tek şey ad olduğu
 * için o zaman ad da anahtara girer ("Folyo 641" / "Folyo 651").
 */
export function templateKey(t: TemplateKeyFields): string {
  const attrs = [t.defaultBrandId, t.defaultColorId, t.defaultSizeId, t.defaultThicknessId].map(
    (v) => v ?? '',
  );
  const hasAttrs = attrs.some(Boolean);
  return [
    t.categoryId,
    ...attrs,
    normalizeName(t.defaultVariant),
    hasAttrs ? '' : normalizeName(t.name),
  ].join('|');
}

/**
 * Renk anahtarı: aynı ad + aynı kod + aynı marka aynı renktir. Beyaz 1001
 * ile Beyaz 2002 farklıdır; kodsuz "Beyaz" da ayrı bir kayıttır.
 */
export function colorKey(c: {
  name?: string | null;
  code?: string | null;
  brandId?: string | null;
}): string {
  return [normalizeName(c.name), normalizeName(c.code), c.brandId ?? ''].join('|');
}
