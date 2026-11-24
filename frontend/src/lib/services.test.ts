import { describe, expect, it } from 'vitest';
import { bestBundle, bundleLabel, pickTier, tierRange } from './services';
import type { ServiceBundle, ServiceTier } from '../api/services.api';

const tier = (id: string, min: number | null, max: number | null, sortOrder: number): ServiceTier => ({
  id, typeId: 't', name: id, minMeasure: min, maxMeasure: max, unit: null, price: 1, currency: 'TRY', sortOrder,
});

describe('services (teklif formu)', () => {
  const tiers = [tier('big', 30, null, 2), tier('small', null, 10, 0), tier('mid', 10, 30, 1)];

  it('ölçüye uyan kademe: sunucuyla aynı kural', () => {
    expect(pickTier(tiers, 9.9)?.id).toBe('small');
    expect(pickTier(tiers, 10)?.id).toBe('mid');
    expect(pickTier(tiers, 30)?.id).toBe('big');
    expect(pickTier(tiers, undefined)?.id).toBe('small');
  });

  it('kombinasyon indirimi yalnız paketteki hizmetlerin toplamına', () => {
    const b: ServiceBundle = { id: 'b', name: 'Harf', serviceTypeIds: ['a', 'c'], discountKind: 'percent', discountValue: 10, isActive: true };
    const hit = bestBundle([b], [{ serviceTypeId: 'a', lineTotal: 100 }, { serviceTypeId: 'c', lineTotal: 50 }, { lineTotal: 1000 }]);
    expect(hit?.amount).toBe(15);
    expect(bestBundle([b], [{ serviceTypeId: 'a', lineTotal: 100 }])).toBeNull();
    expect(bundleLabel(b)).toBe('Kombinasyon indirimi — Harf (%10)');
  });

  it('kademe aralığının metni', () => {
    expect(tierRange({ minMeasure: null, maxMeasure: 10 }, 'cm')).toBe('10 cm altı');
    expect(tierRange({ minMeasure: 10, maxMeasure: 30 })).toBe('10–30');
    expect(tierRange({ minMeasure: 30, maxMeasure: null }, 'cm')).toBe('30 cm ve üstü');
  });
});
