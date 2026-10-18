import type { MaterialTemplate, Plate } from '../types';
import { formatNumber } from './format';
import type { Facet } from '../components/ui/FacetChips';

/** Sunucudaki normalizeName ile aynı: kenar boşluğu, çift boşluk, büyük/küçük harf. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}

interface KeyFields {
  categoryId: string;
  name?: string | null;
  defaultBrandId?: string | null;
  defaultColorId?: string | null;
  defaultSizeId?: string | null;
  defaultThicknessId?: string | null;
  defaultVariant?: string | null;
}

/**
 * Ürün türü anahtarı (sunucudaki templateKey ile aynı kural): kategori +
 * marka + renk + ebat + kalınlık + alt tür; hiç özellik yoksa ad. Aynı
 * anahtarlı iki tür aynı üründür.
 */
export function templateKey(t: KeyFields): string {
  const attrs = [t.defaultBrandId, t.defaultColorId, t.defaultSizeId, t.defaultThicknessId].map((v) => v ?? '');
  const hasAttrs = attrs.some(Boolean);
  return [t.categoryId, ...attrs, normalizeName(t.defaultVariant), hasAttrs ? '' : normalizeName(t.name)].join('|');
}

/** Aynı anahtarı paylaşan tür kümeleri (en eskisi başta). */
export function duplicateTemplateGroups(list: MaterialTemplate[]): MaterialTemplate[][] {
  const map = new Map<string, MaterialTemplate[]>();
  for (const t of list) {
    const k = templateKey(t);
    const g = map.get(k);
    if (g) g.push(t);
    else map.set(k, [t]);
  }
  return [...map.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')));
}

/** Ürün türleri için süzgeç çipleri: marka, kalınlık, ebat, renk, alt tür. */
export const TEMPLATE_FACETS: Facet<MaterialTemplate>[] = [
  { key: 'brand', label: 'Marka', value: (t) => t.defaultBrand?.name },
  {
    key: 'thickness',
    label: 'Kalınlık',
    value: (t) => (t.defaultThickness ? `${formatNumber(t.defaultThickness.valueMm)} mm` : null),
  },
  {
    key: 'size',
    label: 'Ebat',
    value: (t) =>
      t.defaultSize ? `${Number(t.defaultSize.widthMm)}×${Number(t.defaultSize.heightMm)}` : null,
  },
  { key: 'color', label: 'Renk', value: (t) => t.defaultColor?.name },
  { key: 'variant', label: 'Alt tür', value: (t) => t.defaultVariant?.trim() || null },
];

/** Ürün türünün aranabilir metni (ad + bütün özellikleri). */
export function templateSearchText(t: MaterialTemplate): string {
  return [
    t.name,
    t.category?.name,
    t.defaultBrand?.name,
    t.defaultColor?.name,
    t.defaultColor?.code,
    t.defaultThickness ? `${t.defaultThickness.valueMm} mm` : '',
    t.defaultSize ? `${t.defaultSize.widthMm}x${t.defaultSize.heightMm}` : '',
    t.defaultVariant,
    t.description,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Stok kalemleri için süzgeç çipleri (teklif malzeme seçici, stok listesi). */
export const PLATE_FACETS: Facet<Plate>[] = [
  { key: 'brand', label: 'Marka', value: (p) => p.brand?.trim() || null },
  {
    key: 'thickness',
    label: 'Kalınlık',
    value: (p) => (Number(p.thicknessMm) > 0 ? `${formatNumber(p.thicknessMm)} mm` : null),
  },
  {
    key: 'size',
    label: 'Ebat',
    value: (p) => {
      const s = p.template?.defaultSize;
      return s ? `${Number(s.widthMm)}×${Number(s.heightMm)}` : null;
    },
  },
  { key: 'color', label: 'Renk', value: (p) => p.color?.trim() || null },
  { key: 'variant', label: 'Alt tür', value: (p) => p.variant?.trim() || null },
];
