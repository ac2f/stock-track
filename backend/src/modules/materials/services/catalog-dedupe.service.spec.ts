import { MaterialBrand } from '../entities/material-brand.entity';
import { MaterialCategoryEntity } from '../entities/material-category.entity';
import { MaterialColor } from '../entities/material-color.entity';
import { MaterialPlate } from '../entities/material-plate.entity';
import { MaterialSize } from '../entities/material-size.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialThickness } from '../entities/material-thickness.entity';
import { CatalogDedupeService } from './catalog-dedupe.service';

/**
 * Katalog tekilleştirme. En eski kayıt korunur, kopyalara bağlı stok/şablon
 * referansları ona taşınır, hiçbir iş kaydı silinmez.
 */
describe('CatalogDedupeService', () => {
  const at = (n: number) => new Date(2026, 0, n);

  interface Rows {
    categories?: unknown[];
    brands?: unknown[];
    colors?: unknown[];
    sizes?: unknown[];
    thicknesses?: unknown[];
    templates?: unknown[];
  }

  function buildService(rows: Rows) {
    const updates: { entity: string; where: unknown; set: unknown }[] = [];
    const deletes: { entity: string; ids: string[] }[] = [];

    const manager = {
      find: jest.fn(async (entity: { name: string }) => {
        const map: Record<string, unknown[]> = {
          MaterialCategoryEntity: rows.categories ?? [],
          MaterialBrand: rows.brands ?? [],
          MaterialColor: rows.colors ?? [],
          MaterialSize: rows.sizes ?? [],
          MaterialThickness: rows.thicknesses ?? [],
          MaterialTemplate: rows.templates ?? [],
        };
        return map[entity.name] ?? [];
      }),
      update: jest.fn(async (entity: { name: string }, where: unknown, set: unknown) => {
        updates.push({ entity: entity.name, where, set });
      }),
      softDelete: jest.fn(async (entity: { name: string }, ids: string[]) => {
        deletes.push({ entity: entity.name, ids });
      }),
    };

    const dataSource = {
      transaction: (cb: (m: unknown) => Promise<unknown>) => cb(manager),
      getRepository: () => ({ count: jest.fn(async () => 0) }),
    };

    return {
      service: new CatalogDedupeService(dataSource as never),
      updates,
      deletes,
    };
  }

  it('yazım farkı olan türleri tek küme sayar, en eskiyi korur', async () => {
    const { service } = buildService({
      categories: [
        { id: 'c-old', name: 'Dekota', createdAt: at(1) },
        { id: 'c-mid', name: ' dekota ', createdAt: at(2) },
        { id: 'c-new', name: 'DEKOTA', createdAt: at(3) },
        { id: 'c-other', name: 'Pleksi', createdAt: at(1) },
      ],
    });

    const report = await service.preview();

    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].keepId).toBe('c-old');
    expect(report.categories[0].mergeIds).toEqual(['c-mid', 'c-new']);
  });

  it('önizleme hiçbir şeyi değiştirmez', async () => {
    const { service, updates, deletes } = buildService({
      categories: [
        { id: 'a', name: 'Dekota', createdAt: at(1) },
        { id: 'b', name: 'dekota', createdAt: at(2) },
      ],
    });

    await service.preview();

    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it('tür birleştirirken şablon ve alt katalogları korunan türe taşır', async () => {
    const { service, updates, deletes } = buildService({
      categories: [
        { id: 'keep', name: 'Dekota', createdAt: at(1) },
        { id: 'dup', name: 'dekota', createdAt: at(2) },
      ],
    });

    await service.apply();

    const moved = updates.filter((u) => (u.where as { categoryId?: string }).categoryId === 'dup');
    // Şablon + marka + renk + ebat + kalınlık taşınmalı.
    expect(moved.map((u) => u.entity).sort()).toEqual(
      [
        MaterialBrand.name,
        MaterialColor.name,
        MaterialSize.name,
        MaterialTemplate.name,
        MaterialThickness.name,
      ].sort(),
    );
    expect(moved.every((u) => (u.set as { categoryId: string }).categoryId === 'keep')).toBe(true);
    expect(deletes).toContainEqual({
      entity: MaterialCategoryEntity.name,
      ids: ['dup'],
    });
  });

  it('marka birleştirirken stok kalemlerini korunan markaya bağlar', async () => {
    const { service, updates } = buildService({
      brands: [
        { id: 'b1', categoryId: 'c1', name: 'Dek', createdAt: at(1) },
        { id: 'b2', categoryId: 'c1', name: 'DEK', createdAt: at(2) },
      ],
    });

    await service.apply();

    expect(updates).toContainEqual({
      entity: MaterialPlate.name,
      where: { brandId: 'b2' },
      set: { brandId: 'b1' },
    });
  });

  it('farklı kategorideki aynı adlı markaları BİRLEŞTİRMEZ', async () => {
    const { service } = buildService({
      brands: [
        { id: 'b1', categoryId: 'c1', name: 'Beyaz', createdAt: at(1) },
        { id: 'b2', categoryId: 'c2', name: 'Beyaz', createdAt: at(2) },
      ],
    });

    const report = await service.preview();

    expect(report.brands).toEqual([]);
  });

  it('ebat ve kalınlıkta sayısal eşitliği yakalar (3 ile 3.00)', async () => {
    const { service } = buildService({
      sizes: [
        { id: 's1', categoryId: 'c1', widthMm: 3050, heightMm: 1560, createdAt: at(1) },
        { id: 's2', categoryId: 'c1', widthMm: '3050.00', heightMm: '1560.0', createdAt: at(2) },
      ],
      thicknesses: [
        { id: 't1', categoryId: 'c1', valueMm: 3, createdAt: at(1) },
        { id: 't2', categoryId: 'c1', valueMm: '3.00', createdAt: at(2) },
      ],
    });

    const report = await service.preview();

    expect(report.sizes[0].mergeIds).toEqual(['s2']);
    expect(report.thicknesses[0].mergeIds).toEqual(['t2']);
  });

  it('varsayılanları farklı şablonları ayrı tutar', async () => {
    const { service } = buildService({
      templates: [
        { id: 'x', categoryId: 'c1', name: 'Dekota', defaultThicknessId: 'th3', createdAt: at(1) },
        { id: 'y', categoryId: 'c1', name: 'Dekota', defaultThicknessId: 'th5', createdAt: at(2) },
      ],
    });

    const report = await service.preview();

    expect(report.templates).toEqual([]);
  });

  it('kopya yoksa hiçbir şey yapmaz', async () => {
    const { service, updates, deletes } = buildService({
      categories: [{ id: 'a', name: 'Dekota', createdAt: at(1) }],
    });

    const report = await service.apply();

    expect(report.merged).toBe(0);
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });
});
