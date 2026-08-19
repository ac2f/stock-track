import type { Plate } from '../types';

/**
 * Stok listelerinde iki seviyeli gruplama:
 *   1) ÜRÜN TÜRÜ (kategori)  — "Dekota", "Pleksi"…
 *   2) AYNI MALZEME          — aynı şablondan gelen fiziksel parçalar
 *
 * Depoda bir malzemenin onlarca ayrı parçası (kesilmiş tabaka, farklı sahip)
 * bulunabilir. Bunlar liste içinde tek tek göründüğünde ekran okunmaz hale
 * geliyordu; aynı malzemenin parçaları tek başlık altında toplanır.
 */

/** Bir plakanın ürün türü (kategori) adı. */
export function plateCategory(plate: Plate): string {
  return plate.template?.category?.name?.trim() || 'Diğer';
}

/**
 * "Aynı malzeme" kimliği. Aynı şablondan üretilmiş parçalar aynı malzemedir;
 * şablon yoksa marka/renk/kalınlık/ad birleşimine düşülür.
 */
export function materialKey(plate: Plate): string {
  if (plate.templateId) return `t:${plate.templateId}`;
  return [
    plateCategory(plate),
    plate.brand ?? '',
    plate.color ?? '',
    plate.thicknessMm ?? '',
    plate.variant ?? '',
    plate.name,
  ].join('|');
}

/**
 * Alt grup başlığı: aynı malzemeyi tanımlayan kısa ad.
 * Parçaya özel bilgi (kalan ebat, sahip) başlıkta YER ALMAZ — o bilgi
 * parçanın kendi satırındadır.
 */
export function materialLabel(plate: Plate): string {
  const parts = [
    plate.template?.name?.trim() || plate.name,
    plate.brand,
    plate.color,
    plate.thicknessMm ? `${plate.thicknessMm}mm` : '',
    plate.variant,
  ].filter(Boolean);
  // Şablon adı zaten marka/rengi içerebiliyor → tekrarları ele.
  const seen = new Set<string>();
  return parts
    .filter((p) => {
      const k = String(p).toLocaleLowerCase('tr');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(' · ');
}

export interface MaterialGroup {
  key: string;
  label: string;
  plates: Plate[];
}

export interface CategoryGroup {
  category: string;
  count: number;
  materials: MaterialGroup[];
}

/**
 * Plakaları türe, tür içinde de aynı malzemeye göre gruplar.
 * Gruplar ve alt gruplar ada göre (Türkçe) sıralanır.
 */
export function groupPlates(plates: Plate[]): CategoryGroup[] {
  const byCategory = new Map<string, Map<string, MaterialGroup>>();

  for (const plate of plates) {
    const cat = plateCategory(plate);
    let materials = byCategory.get(cat);
    if (!materials) {
      materials = new Map();
      byCategory.set(cat, materials);
    }
    const key = materialKey(plate);
    const existing = materials.get(key);
    if (existing) existing.plates.push(plate);
    else materials.set(key, { key, label: materialLabel(plate), plates: [plate] });
  }

  return [...byCategory.entries()]
    .map(([category, materials]) => ({
      category,
      count: [...materials.values()].reduce((n, m) => n + m.plates.length, 0),
      materials: [...materials.values()].sort((a, b) =>
        a.label.localeCompare(b.label, 'tr'),
      ),
    }))
    .sort((a, b) => a.category.localeCompare(b.category, 'tr'));
}
