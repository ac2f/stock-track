import {
  pickRule,
  plateFacts,
  ruleLabel,
  ruleMatches,
  ruleSpecificity,
  sameScope,
} from './price-rule-match.util';

describe('price-rule-match', () => {
  const plate = {
    variant: 'dökme',
    template: {
      categoryId: 'pleksi',
      defaultBrandId: 'b1',
      defaultBrand: { name: 'Akpolimer' },
      defaultThicknessId: 't1',
      defaultThickness: { valueMm: '2.80' },
      defaultColorId: 'c1',
      defaultColor: { name: 'Beyaz' },
      defaultSizeId: 's1',
      defaultSize: { widthMm: '1220.00', heightMm: '2440.00' },
      defaultVariant: 'Çekme',
    },
  };
  const facts = plateFacts(plate)!;

  it('kalemin değeri türün varsayılanından önce gelir', () => {
    expect(facts.variant).toBe('dökme');
    expect(facts.thicknessKey).toBe('2.80');
    expect(facts.sizeKey).toBe('1220.00x2440.00');
  });

  it('boş alan hepsini kapsar, dolu alan eşleşmeli', () => {
    expect(ruleMatches({ categoryId: 'pleksi' }, facts)).toBe(true);
    expect(ruleMatches({ categoryId: 'dekota' }, facts)).toBe(false);
    expect(ruleMatches({ categoryId: 'pleksi', variant: ' DÖKME ' }, facts)).toBe(true);
    expect(ruleMatches({ categoryId: 'pleksi', variant: 'Çekme' }, facts)).toBe(false);
    expect(ruleMatches({ categoryId: 'pleksi', colorId: 'c2', color: { name: 'Siyah' } }, facts)).toBe(false);
  });

  it('aynı adlı renkte kod farklıysa eşleşmez', () => {
    const coded = plateFacts({
      ...plate,
      template: { ...plate.template, defaultColor: { name: 'Beyaz', code: '1001' } },
    })!;
    expect(
      ruleMatches({ categoryId: 'pleksi', colorId: 'c9', color: { name: 'Beyaz', code: '1001' } }, coded),
    ).toBe(true);
    expect(
      ruleMatches({ categoryId: 'pleksi', colorId: 'c8', color: { name: 'Beyaz', code: '2002' } }, coded),
    ).toBe(false);
    expect(
      ruleLabel({ categoryId: 'p', category: { name: 'Pleksi' }, color: { name: 'Beyaz', code: '1001' } }),
    ).toBe('Pleksi · Beyaz 1001');
  });

  it('kopya katalog kaydında (farklı kimlik, aynı değer) de eşleşir', () => {
    expect(
      ruleMatches({ categoryId: 'pleksi', brandId: 'b9', brand: { name: ' akpolimer' } }, facts),
    ).toBe(true);
    expect(
      ruleMatches({ categoryId: 'pleksi', thicknessId: 't9', thickness: { valueMm: 2.8 } }, facts),
    ).toBe(true);
  });

  it('kalem başka bir ebat seçtiyse türün ebadıyla eşleşmez', () => {
    const own = plateFacts({ ...plate, sizeId: 's2' })!;
    expect(
      ruleMatches(
        { categoryId: 'pleksi', sizeId: 's1', size: { widthMm: 1220, heightMm: 2440 } },
        own,
      ),
    ).toBe(false);
  });

  it('en çok alanı tutan çatı kazanır', () => {
    const rules = [
      { id: 'tum', categoryId: 'pleksi' },
      { id: 'marka-renk', categoryId: 'pleksi', brandId: 'b1', colorId: 'c1' },
      { id: 'kalinlik', categoryId: 'pleksi', thicknessId: 't1' },
    ];
    expect(pickRule(rules, facts)?.id).toBe('marka-renk');
    expect(ruleSpecificity({ categoryId: 'x', thicknessId: 't' })).toBeGreaterThan(
      ruleSpecificity({ categoryId: 'x', colorId: 'c' }),
    );
  });

  it('kapsam karşılaştırması ve okunur ad', () => {
    expect(sameScope({ categoryId: 'p', variant: 'Dökme' }, { categoryId: 'p', variant: 'dökme ' })).toBe(true);
    expect(sameScope({ categoryId: 'p' }, { categoryId: 'p', colorId: 'c' })).toBe(false);
    expect(ruleLabel({ categoryId: 'p', category: { name: 'Pleksi' } })).toBe('Tüm Pleksi');
    expect(
      ruleLabel({
        categoryId: 'p',
        category: { name: 'Pleksi' },
        brand: { name: 'Akpolimer' },
        thickness: { valueMm: '2.80' },
        color: { name: 'Beyaz' },
      }),
    ).toBe('Pleksi · Akpolimer · 2.8 mm · Beyaz');
  });
});
