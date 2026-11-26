import { bestBundle, bundleLabel, pickTier } from './service-catalog.util';

describe('service-catalog.util', () => {
  const tiers = [
    { id: 'big', minMeasure: 30, maxMeasure: null, sortOrder: 2 },
    { id: 'small', minMeasure: null, maxMeasure: 10, sortOrder: 0 },
    { id: 'mid', minMeasure: 10, maxMeasure: 30, sortOrder: 1 },
  ];

  it('ölçüye uyan kademeyi seçer: alt sınır dahil, üst sınır hariç', () => {
    expect(pickTier(tiers, 4)?.id).toBe('small');
    expect(pickTier(tiers, 10)?.id).toBe('mid');
    expect(pickTier(tiers, 29.99)?.id).toBe('mid');
    expect(pickTier(tiers, 30)?.id).toBe('big');
    expect(pickTier(tiers, null)?.id).toBe('small'); // (ölçü yok: ilk kademe)
    expect(pickTier([{ id: 'x', minMeasure: 5, maxMeasure: 8 }], 9)).toBeNull();
  });

  const bundles = [
    { id: 'b1', name: 'Harf paketi', serviceTypeIds: ['bukum', 'yapistirma'], discountKind: 'percent' as const, discountValue: 10 },
    { id: 'b2', name: 'Sabit', serviceTypeIds: ['bukum', 'yapistirma'], discountKind: 'fixed' as const, discountValue: 50 },
    { id: 'b3', name: 'Montajlı', serviceTypeIds: ['bukum', 'montaj'], discountKind: 'percent' as const, discountValue: 50 },
  ];

  it('paketteki hizmetlerin hepsi varsa en büyük indirimi uygular, yalnız o hizmetlerin toplamına', () => {
    const lines = [
      { serviceTypeId: 'bukum', lineTotal: 1000 },
      { serviceTypeId: 'yapistirma', lineTotal: 200 },
      { serviceTypeId: null, lineTotal: 5000 }, // (malzeme: indirime girmez)
    ];
    const r = bestBundle(bundles, lines)!;
    expect(r.bundle.id).toBe('b1');
    expect(r.base).toBe(1200);
    expect(r.amount).toBe(120);
  });

  it('eksik hizmette indirim yok; sabit indirim toplamı aşmaz; pasif paket sayılmaz', () => {
    expect(bestBundle(bundles, [{ serviceTypeId: 'bukum', lineTotal: 100 }])).toBeNull();
    const r = bestBundle([bundles[1]], [{ serviceTypeId: 'bukum', lineTotal: 20 }, { serviceTypeId: 'yapistirma', lineTotal: 10 }])!;
    expect(r.amount).toBe(30);
    expect(bestBundle([{ ...bundles[0], isActive: false }], [{ serviceTypeId: 'bukum', lineTotal: 1 }, { serviceTypeId: 'yapistirma', lineTotal: 1 }])).toBeNull();
  });

  it('indirim satırının metni', () => {
    expect(bundleLabel(bundles[0])).toBe('Kombinasyon indirimi — Harf paketi (%10)');
    expect(bundleLabel(bundles[1])).toBe('Kombinasyon indirimi — Sabit (sabit)');
  });
});

describe('kombinasyon indirimi: atlanan paketten sonrakiler de bakılır', () => {
  const lines = [{ serviceTypeId: 'a', lineTotal: 100 }, { serviceTypeId: 'b', lineTotal: 300 }];
  const b = (id: string, ids: string[], kind: 'percent' | 'fixed', v: number, isActive = true) => ({ id, name: id, serviceTypeIds: ids, discountKind: kind, discountValue: v, isActive });
  it('pasif, eksik ya da tek hizmetli paket atlanır; sonraki uygun paket seçilir', () => {
    expect(bestBundle([b('p', ['a', 'b'], 'percent', 50, false), b('q', ['a', 'b'], 'percent', 10)], lines)!.bundle.id).toBe('q');
    expect(bestBundle([b('x', ['a', 'z'], 'percent', 50), b('q', ['a', 'b'], 'fixed', 30)], lines)!.amount).toBe(30);
    expect(bestBundle([b('s', ['a', 'a'], 'percent', 50), b('q', ['a', 'b'], 'percent', 10)], lines)!.bundle.id).toBe('q');
  });
  it('yüzde 0..100 arasında tutulur, eksi indirim yok', () => {
    expect(bestBundle([b('q', ['a', 'b'], 'percent', 150)], lines)!.amount).toBe(400);
    expect(bestBundle([b('q', ['a', 'b'], 'percent', -5)], lines)).toBeNull();
    expect(bestBundle([b('q', ['a', 'b'], 'fixed', -5)], lines)).toBeNull();
    expect(bestBundle([b('q', ['a', 'b'], 'percent', 10)], [{ serviceTypeId: 'a', lineTotal: 0 }, { serviceTypeId: 'b', lineTotal: 0 }])).toBeNull();
  });
  it('ölçü yoksa sıradaki ilk kademe; sıra sortOrder ile', () => {
    const tiers = [{ id: 't2', sortOrder: 2, minMeasure: 0 }, { id: 't1', sortOrder: 1, minMeasure: 10 }];
    expect(pickTier(tiers, null)!.id).toBe('t1');
    expect(pickTier(tiers, Number.NaN)!.id).toBe('t1');
    expect(pickTier([], null)).toBeNull();
  });
});
