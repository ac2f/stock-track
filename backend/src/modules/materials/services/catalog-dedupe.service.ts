import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, Not } from 'typeorm';
import { normalizeName, sizeKey, normalizeNumber } from '../catalog-key.util';
import { MaterialBrand } from '../entities/material-brand.entity';
import { MaterialCategoryEntity } from '../entities/material-category.entity';
import { MaterialColor } from '../entities/material-color.entity';
import { MaterialPlate } from '../entities/material-plate.entity';
import { MaterialSize } from '../entities/material-size.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialThickness } from '../entities/material-thickness.entity';

/** Bir katalog türünde bulunan kopya kümesi. */
export interface DuplicateGroup {
  /** Kullanıcıya gösterilecek ad ("Dekota", "3.00mm", "3050x1560"). */
  label: string;
  /** Korunacak (en eski) kaydın kimliği. */
  keepId: string;
  /** Birleştirilecek kopya kimlikleri. */
  mergeIds: string[];
}

export interface DedupeReport {
  categories: DuplicateGroup[];
  brands: DuplicateGroup[];
  colors: DuplicateGroup[];
  sizes: DuplicateGroup[];
  thicknesses: DuplicateGroup[];
  templates: DuplicateGroup[];
  /** Uygulandıysa kaç kayıt birleştirildi. */
  merged: number;
}

/**
 * Katalog tekilleştirme.
 *
 * Uygulamanın önceki sürümlerinde aynı tür/marka/renk farklı yazımlarla
 * ("Dekota", "dekota", " Dekota ") birden çok kez açılabiliyordu. Bu servis
 * kopyaları bulur ve İSTENDİĞİNDE birleştirir:
 *
 *  - Her kopya kümesinde EN ESKİ kayıt korunur (geçmiş ona bağlıydı),
 *  - kopyalara işaret eden TÜM referanslar (şablon, plaka, alt kataloglar)
 *    korunan kayda taşınır,
 *  - kopyalar ancak referansları taşındıktan SONRA soft-delete edilir.
 *
 * Hiçbir stok, teklif, satış ya da cari kaydı silinmez; yalnızca hangi katalog
 * satırına baktıkları değişir. Tüm işlem tek transaction içindedir.
 */
@Injectable()
export class CatalogDedupeService {
  private readonly logger = new Logger(CatalogDedupeService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Kopyaları yalnızca RAPORLAR (hiçbir şey değiştirmez). */
  async preview(): Promise<DedupeReport> {
    return this.dataSource.transaction((m) => this.collect(m));
  }

  /** Kopyaları birleştirir ve sonucu raporlar. */
  async apply(): Promise<DedupeReport> {
    return this.dataSource.transaction(async (m) => {
      const report = await this.collect(m);
      let merged = 0;

      // Sıra önemli: önce alt kataloglar (marka/renk/ebat/kalınlık) kendi
      // içinde birleşir, sonra şablonlar, en son türler. Böylece tür
      // birleştirmesi sırasında alt kataloglar zaten tekilleşmiş olur.
      for (const g of report.brands) {
        merged += await this.mergeBrand(m, g);
      }
      for (const g of report.colors) {
        merged += await this.mergeColor(m, g);
      }
      for (const g of report.sizes) {
        merged += await this.mergeSize(m, g);
      }
      for (const g of report.thicknesses) {
        merged += await this.mergeThickness(m, g);
      }
      for (const g of report.templates) {
        merged += await this.mergeTemplate(m, g);
      }
      for (const g of report.categories) {
        merged += await this.mergeCategory(m, g);
      }

      this.logger.log(`Katalog tekilleştirme: ${merged} kopya birleştirildi.`);
      return { ...report, merged };
    });
  }

  // ── Tespit ──────────────────────────────────────────────────────────
  private async collect(m: EntityManager): Promise<DedupeReport> {
    const [categories, brands, colors, sizes, thicknesses, templates] =
      await Promise.all([
        m.find(MaterialCategoryEntity, { order: { createdAt: 'ASC' } }),
        m.find(MaterialBrand, { order: { createdAt: 'ASC' } }),
        m.find(MaterialColor, { order: { createdAt: 'ASC' } }),
        m.find(MaterialSize, { order: { createdAt: 'ASC' } }),
        m.find(MaterialThickness, { order: { createdAt: 'ASC' } }),
        m.find(MaterialTemplate, { order: { createdAt: 'ASC' } }),
      ]);

    return {
      categories: this.group(categories, (c) => normalizeName(c.name), (c) => c.name),
      brands: this.group(
        brands,
        (b) => `${b.categoryId}|${normalizeName(b.name)}`,
        (b) => b.name,
      ),
      colors: this.group(
        colors,
        (c) => `${c.categoryId}|${normalizeName(c.name)}`,
        (c) => c.name,
      ),
      sizes: this.group(
        sizes,
        (s) => `${s.categoryId}|${sizeKey(s.widthMm, s.heightMm)}`,
        (s) => `${Number(s.widthMm)}×${Number(s.heightMm)}`,
      ),
      thicknesses: this.group(
        thicknesses,
        (t) => `${t.categoryId}|${normalizeNumber(t.valueMm)}`,
        (t) => `${Number(t.valueMm)}mm`,
      ),
      // Şablonlarda "aynı" olmak için kategori + ad + tüm varsayılanlar eşleşmeli
      // (farklı varsayılanlar gerçekten farklı şablonlardır).
      templates: this.group(
        templates,
        (t) =>
          [
            t.categoryId,
            normalizeName(t.name),
            t.defaultBrandId ?? '',
            t.defaultColorId ?? '',
            t.defaultSizeId ?? '',
            t.defaultThicknessId ?? '',
            normalizeName(t.defaultVariant ?? ''),
          ].join('|'),
        (t) => t.name,
      ),
      merged: 0,
    };
  }

  /** Anahtarı aynı olan kayıtları kümeler; tek başına olanlar elenir. */
  private group<T extends { id: string }>(
    rows: T[],
    keyOf: (row: T) => string,
    labelOf: (row: T) => string,
  ): DuplicateGroup[] {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return [...map.values()]
      .filter((list) => list.length > 1)
      .map((list) => ({
        // createdAt ASC sıralı geldiği için ilk kayıt en eskisidir.
        label: labelOf(list[0]),
        keepId: list[0].id,
        mergeIds: list.slice(1).map((r) => r.id),
      }));
  }

  // ── Birleştirme ─────────────────────────────────────────────────────
  private async mergeBrand(m: EntityManager, g: DuplicateGroup): Promise<number> {
    for (const id of g.mergeIds) {
      await m.update(MaterialTemplate, { defaultBrandId: id }, { defaultBrandId: g.keepId });
      await m.update(MaterialPlate, { brandId: id }, { brandId: g.keepId });
    }
    await this.softDelete(m, MaterialBrand, g.mergeIds);
    return g.mergeIds.length;
  }

  private async mergeColor(m: EntityManager, g: DuplicateGroup): Promise<number> {
    for (const id of g.mergeIds) {
      await m.update(MaterialTemplate, { defaultColorId: id }, { defaultColorId: g.keepId });
      await m.update(MaterialPlate, { colorId: id }, { colorId: g.keepId });
    }
    await this.softDelete(m, MaterialColor, g.mergeIds);
    return g.mergeIds.length;
  }

  private async mergeSize(m: EntityManager, g: DuplicateGroup): Promise<number> {
    for (const id of g.mergeIds) {
      await m.update(MaterialTemplate, { defaultSizeId: id }, { defaultSizeId: g.keepId });
      await m.update(MaterialPlate, { sizeId: id }, { sizeId: g.keepId });
    }
    await this.softDelete(m, MaterialSize, g.mergeIds);
    return g.mergeIds.length;
  }

  private async mergeThickness(
    m: EntityManager,
    g: DuplicateGroup,
  ): Promise<number> {
    for (const id of g.mergeIds) {
      await m.update(
        MaterialTemplate,
        { defaultThicknessId: id },
        { defaultThicknessId: g.keepId },
      );
      await m.update(MaterialPlate, { thicknessId: id }, { thicknessId: g.keepId });
    }
    await this.softDelete(m, MaterialThickness, g.mergeIds);
    return g.mergeIds.length;
  }

  private async mergeTemplate(
    m: EntityManager,
    g: DuplicateGroup,
  ): Promise<number> {
    for (const id of g.mergeIds) {
      // Stok kalemleri korunan şablona bağlanır — plakalar SİLİNMEZ.
      await m.update(MaterialPlate, { templateId: id }, { templateId: g.keepId });
    }
    await this.softDelete(m, MaterialTemplate, g.mergeIds);
    return g.mergeIds.length;
  }

  private async mergeCategory(
    m: EntityManager,
    g: DuplicateGroup,
  ): Promise<number> {
    for (const id of g.mergeIds) {
      await m.update(MaterialTemplate, { categoryId: id }, { categoryId: g.keepId });
      await m.update(MaterialBrand, { categoryId: id }, { categoryId: g.keepId });
      await m.update(MaterialColor, { categoryId: id }, { categoryId: g.keepId });
      await m.update(MaterialSize, { categoryId: id }, { categoryId: g.keepId });
      await m.update(MaterialThickness, { categoryId: id }, { categoryId: g.keepId });
    }
    await this.softDelete(m, MaterialCategoryEntity, g.mergeIds);
    return g.mergeIds.length;
  }

  /** Kopyaları soft-delete eder (kayıt tarihçede kalır, listelerde çıkmaz). */
  private async softDelete(
    m: EntityManager,
    entity: Parameters<EntityManager['softDelete']>[0],
    ids: string[],
  ): Promise<void> {
    if (ids.length) await m.softDelete(entity, ids);
  }

  /**
   * Tür birleştirmesinden sonra alt kataloglarda oluşabilecek YENİ kopyaları
   * (iki farklı türdeki "Beyaz" tek türe taşındı) temizlemek için ikinci tur.
   * `apply` çağrısı bunu kendiliğinden yapar.
   */
  async applyUntilStable(maxRounds = 3): Promise<DedupeReport> {
    let last = await this.apply();
    let total = last.merged;
    for (let i = 1; i < maxRounds && last.merged > 0; i++) {
      last = await this.apply();
      total += last.merged;
    }
    return { ...last, merged: total };
  }

  /** Sahipsiz (kategorisi silinmiş) katalog satırı var mı — teşhis için. */
  async orphanCount(): Promise<number> {
    return this.dataSource.getRepository(MaterialTemplate).count({
      where: { categoryId: Not(IsNull()) },
    });
  }
}
