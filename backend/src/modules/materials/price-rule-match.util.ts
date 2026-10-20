import { normalizeName, normalizeNumber, sizeKey } from './catalog-key.util';

/**
 * Fiyat çatısı eşleşmesi: hangi çatı hangi stok kalemini kapsar, birden çok
 * çatı uyarsa hangisi geçerlidir. Veritabanından bağımsız saf fonksiyonlar.
 */

/** Çatının kapsamı (boş alan = hepsi). */
export interface RuleScope {
  categoryId: string;
  brandId?: string | null;
  brand?: { name: string } | null;
  thicknessId?: string | null;
  thickness?: { valueMm: number | string } | null;
  colorId?: string | null;
  color?: { name: string; code?: string | null } | null;
  sizeId?: string | null;
  size?: { widthMm: number | string; heightMm: number | string } | null;
  variant?: string | null;
}

/** Stok kaleminin çatı eşleşmesinde kullanılan özellikleri. */
export interface PlateFacts {
  categoryId: string;
  brandId: string | null;
  brandName: string;
  thicknessId: string | null;
  thicknessKey: string;
  colorId: string | null;
  /** Renk adı + kod ("beyaz|1001"); aynı adlı farklı kodlar ayrıdır. */
  colorName: string;
  sizeId: string | null;
  /** Standart tabaka ebadının anahtarı ("1220.00x2440.00"), bilinmiyorsa boş. */
  sizeKey: string;
  variant: string;
}

/** Eşleşme için gereken stok kalemi alanları (MaterialPlate'in alt kümesi). */
export interface PlateLike {
  brandId?: string | null;
  brand?: string | null;
  thicknessId?: string | null;
  thicknessMm?: number | string | null;
  colorId?: string | null;
  color?: string | null;
  colorCode?: string | null;
  sizeId?: string | null;
  variant?: string | null;
  template?: {
    categoryId: string;
    defaultBrandId?: string | null;
    defaultBrand?: { name: string } | null;
    defaultThicknessId?: string | null;
    defaultThickness?: { valueMm: number | string } | null;
    defaultColorId?: string | null;
    defaultColor?: { name: string; code?: string | null } | null;
    defaultSizeId?: string | null;
    defaultSize?: { widthMm: number | string; heightMm: number | string } | null;
    defaultVariant?: string | null;
  } | null;
}

/**
 * Kalemin özellikleri: kalemde girilen değer, yoksa ürün türünden gelen.
 * Ebat her zaman standart tabakadır (kalan/kesilmiş ebat fiyatı değiştirmez).
 */
export function plateFacts(plate: PlateLike): PlateFacts | null {
  const t = plate.template;
  if (!t) return null;
  const sizeId = plate.sizeId ?? t.defaultSizeId ?? null;
  const std =
    t.defaultSize && (sizeId == null || sizeId === (t.defaultSizeId ?? null))
      ? sizeKey(t.defaultSize.widthMm, t.defaultSize.heightMm)
      : '';
  const thickness = plate.thicknessMm ?? t.defaultThickness?.valueMm ?? null;
  return {
    categoryId: t.categoryId,
    brandId: plate.brandId ?? t.defaultBrandId ?? null,
    brandName: normalizeName(plate.brand ?? t.defaultBrand?.name),
    thicknessId: plate.thicknessId ?? t.defaultThicknessId ?? null,
    thicknessKey: thickness == null ? '' : normalizeNumber(thickness),
    colorId: plate.colorId ?? t.defaultColorId ?? null,
    colorName: plate.color
      ? colorText(plate.color, plate.colorCode)
      : t.defaultColor
        ? colorText(t.defaultColor.name, t.defaultColor.code)
        : '',
    sizeId,
    sizeKey: std,
    variant: normalizeName(plate.variant ?? t.defaultVariant),
  };
}

/** Renk eşleşme metni: ad + kod (Beyaz 1001 ≠ Beyaz 2002). */
function colorText(name: string | null | undefined, code: string | null | undefined): string {
  const n = normalizeName(name);
  return n ? `${n}|${normalizeName(code)}` : '';
}

/** Kimlik ya da (kopya katalog kayıtlarına karşı) normalize değer tutuyor mu. */
function same(
  ruleId: string | null | undefined,
  ruleKey: string,
  plateId: string | null,
  plateKey: string,
): boolean {
  if (ruleId && plateId && ruleId === plateId) return true;
  return !!ruleKey && ruleKey === plateKey;
}

export function ruleMatches(rule: RuleScope, f: PlateFacts): boolean {
  if (rule.categoryId !== f.categoryId) return false;
  if (rule.brandId && !same(rule.brandId, normalizeName(rule.brand?.name), f.brandId, f.brandName)) {
    return false;
  }
  if (
    rule.thicknessId &&
    !same(
      rule.thicknessId,
      rule.thickness ? normalizeNumber(rule.thickness.valueMm) : '',
      f.thicknessId,
      f.thicknessKey,
    )
  ) {
    return false;
  }
  if (
    rule.colorId &&
    !same(rule.colorId, rule.color ? colorText(rule.color.name, rule.color.code) : '', f.colorId, f.colorName)
  ) {
    return false;
  }
  if (
    rule.sizeId &&
    !same(
      rule.sizeId,
      rule.size ? sizeKey(rule.size.widthMm, rule.size.heightMm) : '',
      f.sizeId,
      f.sizeKey,
    )
  ) {
    return false;
  }
  const variant = normalizeName(rule.variant);
  if (variant && variant !== f.variant) return false;
  return true;
}

/**
 * Özgüllük: önce dolu alan sayısı, eşitlikte alanın fiyata etkisi
 * (kalınlık > ebat > marka > alt tür > renk). Ağırlıklar ikinin kuvveti
 * olduğundan farklı alan kümeleri hiçbir zaman eşit puan almaz; aynı kümede
 * aynı kaleme uyan iki çatı ancak kopya olabilir, o da engellenir.
 */
export function ruleSpecificity(rule: RuleScope): number {
  const parts: [unknown, number][] = [
    [rule.thicknessId, 16],
    [rule.sizeId, 8],
    [rule.brandId, 4],
    [normalizeName(rule.variant), 2],
    [rule.colorId, 1],
  ];
  let count = 0;
  let weight = 0;
  for (const [value, w] of parts) {
    if (value) {
      count++;
      weight += w;
    }
  }
  return count * 100 + weight;
}

/** Kaleme uyan çatılardan geçerli olanı (en özel); uyan yoksa null. */
export function pickRule<R extends RuleScope>(rules: R[], f: PlateFacts): R | null {
  let best: R | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (!ruleMatches(r, f)) continue;
    const score = ruleSpecificity(r);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/** İki çatı aynı kapsamı mı tanımlıyor (kopya engeli). */
export function sameScope(a: RuleScope, b: RuleScope): boolean {
  return (
    a.categoryId === b.categoryId &&
    (a.brandId ?? null) === (b.brandId ?? null) &&
    (a.thicknessId ?? null) === (b.thicknessId ?? null) &&
    (a.colorId ?? null) === (b.colorId ?? null) &&
    (a.sizeId ?? null) === (b.sizeId ?? null) &&
    normalizeName(a.variant) === normalizeName(b.variant)
  );
}

/**
 * Okunur ad: "Pleksi · Akpolimer · Dökme · 2.8 mm · Beyaz · 1220×2440".
 * Kapsam yalnız kategoriyse "Tüm Pleksi".
 */
export function ruleLabel(rule: RuleScope & { category?: { name: string } | null }): string {
  const cat = rule.category?.name ?? 'Malzeme';
  const parts = [
    rule.brand?.name,
    rule.variant?.trim() || null,
    rule.thickness ? `${Number(rule.thickness.valueMm)} mm` : null,
    rule.color ? (rule.color.code ? `${rule.color.name} ${rule.color.code}` : rule.color.name) : null,
    rule.size ? `${Number(rule.size.widthMm)}×${Number(rule.size.heightMm)}` : null,
  ].filter((p): p is string => !!p);
  return parts.length ? [cat, ...parts].join(' · ') : `Tüm ${cat}`;
}
