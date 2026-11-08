import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ShopContext } from '../../../common/shop/shop-context';
import { foldedWords, foldTr, sqlFold } from '../../../common/utils/search.util';
import { MaterialTemplate } from '../entities/material-template.entity';

/** Başka işletmelerde kayıtlı benzer ürün türü: yalnız katalog özellikleri (kimse belirtilmez). */
export interface TemplateSuggestion {
  categoryName: string;
  templateName: string;
  measurementType: string;
  brandName: string | null;
  colorName: string | null;
  colorCode: string | null;
  thicknessMm: number | null;
  sheetWidthMm: number | null;
  sheetHeightMm: number | null;
  variant: string | null;
  /** Bu özellikte ürün türü olan işletme sayısı (hangi işletmeler olduğu verilmez). */
  shops: number;
}

export interface SuggestQuery {
  q?: string;
  categoryName?: string;
  brandName?: string;
  colorName?: string;
  thicknessMm?: number;
  sheetWidthMm?: number;
  sheetHeightMm?: number;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Özellik anahtarı: aynı özellikteki ürün türü aynı anahtarı verir (Türkçe harf/büyük-küçük harf duyarsız). */
export function suggestionKey(s: {
  categoryName?: string | null;
  brandName?: string | null;
  colorName?: string | null;
  thicknessMm?: number | null;
  sheetWidthMm?: number | null;
  sheetHeightMm?: number | null;
  variant?: string | null;
}): string {
  return [
    foldTr(s.categoryName ?? ''),
    foldTr(s.brandName ?? ''),
    foldTr(s.colorName ?? ''),
    s.thicknessMm ?? '',
    s.sheetWidthMm ?? '',
    s.sheetHeightMm ?? '',
    foldTr(s.variant ?? ''),
  ].join('|');
}

/**
 * Yeni ürün türü eklerken "başka işletmelerde zaten tanımlı benzer türler": işletme ortak
 * kataloğa bakıp uygun olanı seçer, formu o özelliklerle doldurur (kendi kataloğunda açılır;
 * başkasının kaydına bağlanmaz). Yalnız etkin işletmelerin etkin türleri; kendi türleriniz
 * ve kataloğunuzda zaten bulunanlar önerilmez; işletme kimliği ve stok/fiyat verisi taşınmaz.
 * Arama zorunludur (en az bir ad sözcüğü ya da tür): tüm ortak katalog dökülemez.
 */
@Injectable()
export class TemplateCommunityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MaterialTemplate) private readonly templates: Repository<MaterialTemplate>,
  ) {}

  async suggest(query: SuggestQuery, limit = 10): Promise<TemplateSuggestion[]> {
    const me = ShopContext.requireShopId();
    const words = foldedWords(query.q);
    const category = query.categoryName?.trim();
    if (!words.length && !category) return [];

    const params: unknown[] = [me];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const where = [`t.deleted_at IS NULL`, `t.is_active`, `t.shop_id <> $1::uuid`];
    if (category) where.push(`${sqlFold('c.name')} = ${add(foldTr(category))}`);
    for (const w of words) {
      const p = add(`%${w}%`);
      where.push(
        `(${sqlFold('t.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('c.name')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('b.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('col.name')} LIKE ${p} ESCAPE '\\')`,
      );
    }
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT MIN(c.name) AS category_name,
              MODE() WITHIN GROUP (ORDER BY t.name) AS template_name,
              MIN(t.measurement_type::text) AS measurement_type,
              MIN(b.name) AS brand_name, MIN(col.name) AS color_name, MIN(col.code) AS color_code,
              th.value_mm AS thickness_mm, sz.width_mm, sz.height_mm,
              MIN(t.default_variant) AS variant,
              COUNT(DISTINCT t.shop_id) AS shops
         FROM material_templates t
         JOIN shops s ON s.id = t.shop_id AND s.deleted_at IS NULL AND s.is_active AND s.status = 'active'
         JOIN material_categories c ON c.id = t.category_id AND c.deleted_at IS NULL
         LEFT JOIN material_brands b ON b.id = t.default_brand_id
         LEFT JOIN material_colors col ON col.id = t.default_color_id
         LEFT JOIN material_thicknesses th ON th.id = t.default_thickness_id
         LEFT JOIN material_sizes sz ON sz.id = t.default_size_id
        WHERE ${where.join(' AND ')}
        GROUP BY ${sqlFold('c.name')}, ${sqlFold('b.name')}, ${sqlFold('col.name')}, th.value_mm, sz.width_mm, sz.height_mm, ${sqlFold('t.default_variant')}
        ORDER BY COUNT(DISTINCT t.shop_id) DESC, MIN(c.name)
        LIMIT 200`,
      params,
    );
    const all: TemplateSuggestion[] = rows.map((r) => ({
      categoryName: String(r.category_name),
      templateName: String(r.template_name),
      measurementType: String(r.measurement_type),
      brandName: (r.brand_name as string) ?? null,
      colorName: (r.color_name as string) ?? null,
      colorCode: (r.color_code as string) ?? null,
      thicknessMm: num(r.thickness_mm),
      sheetWidthMm: num(r.width_mm),
      sheetHeightMm: num(r.height_mm),
      variant: (r.variant as string) ?? null,
      shops: Number(r.shops),
    }));

    // Kendi kataloğumda zaten olanlar önerilmez.
    const mine = new Set(
      (await this.templates.find()).map((t) =>
        suggestionKey({
          categoryName: t.category?.name,
          brandName: t.defaultBrand?.name,
          colorName: t.defaultColor?.name,
          thicknessMm: t.defaultThickness ? Number(t.defaultThickness.valueMm) : null,
          sheetWidthMm: t.defaultSize ? Number(t.defaultSize.widthMm) : null,
          sheetHeightMm: t.defaultSize ? Number(t.defaultSize.heightMm) : null,
          variant: t.defaultVariant ?? null,
        }),
      ),
    );
    return rank(
      all.filter((s) => !mine.has(suggestionKey(s))),
      query,
      foldedWords(query.q),
      limit,
    );
  }
}

/** Ortak kullanım en fazla bu kadar puan ekler: özellik eşleşmesinin (2-3 puan) önüne geçemez, eşitlikte belirler. */
const POPULARITY_CAP = 1.5;

/** Benzerlik: yazılan özelliklerle eşleşen alan sayısı; ortak kullanım küçük bir ağırlık. */
export function rank(list: TemplateSuggestion[], query: SuggestQuery, words: string[], limit: number): TemplateSuggestion[] {
  const category = query.categoryName?.trim();
  const same = (a: string | null, b?: string) => !!b?.trim() && !!a && foldTr(a) === foldTr(b.trim());
  const close = (a: number | null, b?: number) => b != null && a != null && Math.abs(a - b) < 0.011;
  return list
    .map((s) => {
      const hay = foldTr(`${s.templateName} ${s.categoryName} ${s.brandName ?? ''} ${s.colorName ?? ''}`);
      let score = Math.min(POPULARITY_CAP, Math.log2(1 + s.shops) / 4);
      for (const w of words) if (hay.includes(w.replace(/\\/g, ''))) score += 2;
      if (same(s.categoryName, category)) score += 3;
      if (same(s.brandName, query.brandName)) score += 2;
      if (same(s.colorName, query.colorName)) score += 2;
      if (close(s.thicknessMm, query.thicknessMm)) score += 2;
      if (close(s.sheetWidthMm, query.sheetWidthMm) && close(s.sheetHeightMm, query.sheetHeightMm)) score += 2;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}
