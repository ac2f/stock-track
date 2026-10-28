import { describe, expect, it } from 'vitest';
import { parseTemplateQuery } from './templateDraft';

const cats = [{ name: 'Pleksi' }, { name: 'Alüminyum Kompozit' }, { name: 'MDF' }, { name: 'Forex' }];

describe('parseTemplateQuery', () => {
  it('kategori, renk, kalınlık, marka ve ebadı ayıklar', () => {
    const d = parseTemplateQuery('pleksi beyaz 3mm xmarka 1000x2000', { categories: cats });
    expect(d.categoryName).toBe('Pleksi');
    expect(d.colorName).toBe('Beyaz');
    expect(d.thicknessMm).toBe(3);
    expect(d.brandName).toBe('Xmarka');
    expect(d.sheetWidthMm).toBe(1000);
    expect(d.sheetHeightMm).toBe(2000);
    expect(d.leftover).toEqual([]);
  });
  it('yazım hatası ve sözcük sırası fark etmez', () => {
    const d = parseTemplateQuery('2,8 bayaz plexi', { categories: cats });
    expect(d.categoryName).toBe('Pleksi');
    expect(d.colorName).toBe('Beyaz');
    expect(d.thicknessMm).toBe(2.8);
  });
  it('çok sözcüklü kategoriyi yarım yazımla bulur', () => {
    const d = parseTemplateQuery('komp siyah 3', { categories: cats });
    expect(d.categoryName).toBe('Alüminyum Kompozit');
    expect(d.colorName).toBe('Siyah');
    expect(d.thicknessMm).toBe(3);
  });
  it('renk kodunu kalınlıkla karıştırmaz', () => {
    const d = parseTemplateQuery('pleksi beyaz 1001 3', { categories: cats });
    expect(d.colorCode).toBe('1001');
    expect(d.thicknessMm).toBe(3);
  });
  it('katalogdaki marka ve renk yazımına düzeltir', () => {
    const d = parseTemplateQuery('forex akpolimr bayaz 5', {
      categories: cats,
      brands: ['Akpolimer', 'Dekota'],
      colors: ['Beyaz'],
    });
    expect(d.brandName).toBe('Akpolimer');
    expect(d.colorName).toBe('Beyaz');
  });
  it('alt türü tanır', () => {
    const d = parseTemplateQuery('pleksi dokme beyaz', { categories: cats });
    expect(d.variant).toBe('Dökme');
  });
  it('boş arama boş taslak verir', () => {
    const d = parseTemplateQuery('   ', { categories: cats });
    expect(d.categoryName).toBe('');
    expect(d.leftover).toEqual([]);
  });
  it('ebat 100x200 küçük de olsa ebattır, kalınlık değil', () => {
    const d = parseTemplateQuery('pleksi 100x200 3', { categories: cats });
    expect(d.sheetWidthMm).toBe(100);
    expect(d.sheetHeightMm).toBe(200);
    expect(d.thicknessMm).toBe(3);
  });
});
