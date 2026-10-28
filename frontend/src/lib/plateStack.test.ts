import { describe, expect, it } from 'vitest';
import type { Plate } from '../types';
import { stackPlates } from './plateStack';

const base = (over: Partial<Plate>): Plate =>
  ({
    id: Math.random().toString(36).slice(2),
    name: 'Pleksi[Beyaz] 3x1000x2000',
    measurementType: 'area',
    widthMm: 1000,
    heightMm: 2000,
    thicknessMm: 3,
    quantityInStock: 1,
    templateId: 't1',
    owners: [],
    ...over,
  }) as Plate;

describe('stackPlates', () => {
  it('aynı parçaları tek yığında toplar', () => {
    const s = stackPlates([base({}), base({}), base({})]);
    expect(s).toHaveLength(1);
    expect(s[0].count).toBe(3);
    expect(s[0].totalQty).toBe(3);
  });

  it('farklı ebat ayrı yığın olur', () => {
    const s = stackPlates([base({}), base({ widthMm: 500, heightMm: 700 }), base({})]);
    expect(s.map((x) => x.count)).toEqual([2, 1]);
  });

  it('farklı sahip ayrı yığın olur, sahip sırası önemsiz', () => {
    const a = base({ owners: ['Ali', 'Veli'] });
    const b = base({ owners: ['veli', 'ali'] });
    const c = base({ owners: ['Ayşe'] });
    const s = stackPlates([a, b, c]);
    expect(s.map((x) => x.count)).toEqual([2, 1]);
  });

  it('biten parça stoktakilerle birleşmez', () => {
    const s = stackPlates([base({}), base({ quantityInStock: 0 }), base({})]);
    expect(s.map((x) => [x.count, x.totalQty])).toEqual([
      [2, 2],
      [1, 0],
    ]);
  });

  it('farklı malzeme ve kaynak birleşmez', () => {
    const s = stackPlates([
      base({}),
      base({ templateId: 't2' }),
      base({ origin: { transferId: 'x', transferNo: 'TR-1', transferDate: '2025-01-01', fromShopName: 'A' } }),
    ]);
    expect(s).toHaveLength(3);
  });

  it('adetli malzemede toplam miktarı toplar ve giriş tarihi aralığını verir', () => {
    const s = stackPlates([
      base({ measurementType: 'piece', quantityInStock: 5, addedAt: '2025-03-10' }),
      base({ measurementType: 'piece', quantityInStock: 7, addedAt: '2025-01-02' }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].totalQty).toBe(12);
    expect(s[0].addedFrom).toBe('2025-01-02');
    expect(s[0].addedTo).toBe('2025-03-10');
  });

  it('ondalık ölçü gürültüsü yığını bölmez', () => {
    const s = stackPlates([base({ widthMm: 1000 }), base({ widthMm: 1000.0001 })]);
    expect(s).toHaveLength(1);
  });

  it('sırayı korur', () => {
    const a = base({ widthMm: 100, heightMm: 100 });
    const b = base({ widthMm: 200, heightMm: 200 });
    const s = stackPlates([a, b, { ...a, id: 'z' }]);
    expect(s.map((x) => x.first.widthMm)).toEqual([100, 200]);
  });
});
