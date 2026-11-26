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

  it('başka marka ya da kalınlıktaki çatı eşleşmez; kimliği aynı olan eşleşir; türü olmayan kalemin özelliği yok', () => {
    expect(ruleMatches({ categoryId: 'pleksi', brandId: 'b2', brand: { name: 'Plexiglas' } }, facts)).toBe(false);
    expect(ruleMatches({ categoryId: 'pleksi', brandId: 'b1' }, facts)).toBe(true);
    expect(ruleMatches({ categoryId: 'pleksi', thicknessId: 't2', thickness: { valueMm: '3.00' } }, facts)).toBe(false);
    expect(ruleMatches({ categoryId: 'pleksi', thicknessId: 't9', thickness: { valueMm: '2.8' } }, facts)).toBe(true);
    expect(ruleMatches({ categoryId: 'pleksi', thicknessId: 't1' }, facts)).toBe(true);
    expect(plateFacts({ variant: 'x', template: null })).toBeNull();
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

  describe('hariç tutulanlar', () => {
    const white = { id: 'c1', key: 'beyaz|', label: 'Beyaz' };
    const akp = { id: 'b1', key: 'akpolimer', label: 'Akpolimer' };

    it('hariç tutulan renk / marka kapsamın dışında kalır (kimlik ya da adla)', () => {
      expect(ruleMatches({ categoryId: 'pleksi', exclusions: { colors: [white] } }, facts)).toBe(false);
      expect(ruleMatches({ categoryId: 'pleksi', exclusions: { colors: [{ id: 'c9', key: 'kirmizi|', label: 'Kırmızı' }] } }, facts)).toBe(true);
      // kopya katalog kaydı: kimlik farklı, ad aynı
      expect(ruleMatches({ categoryId: 'pleksi', exclusions: { brands: [{ ...akp, id: 'b-kopya' }] } }, facts)).toBe(false);
    });

    it('hariç süzgeçli çatı süzgeçsizden özel, bir alan daha tutandan değil', () => {
      const all = { categoryId: 'pleksi' };
      const notRed = { categoryId: 'pleksi', exclusions: { colors: [{ id: 'c9', key: 'kirmizi|', label: 'Kırmızı' }] } };
      const thick = { categoryId: 'pleksi', thicknessId: 't1', thickness: { valueMm: 2.8 } };
      expect(ruleSpecificity(notRed)).toBeGreaterThan(ruleSpecificity(all));
      expect(ruleSpecificity(thick)).toBeGreaterThan(ruleSpecificity(notRed));
      expect(pickRule([all, notRed], facts)).toBe(notRed);
      expect(pickRule([all, { ...notRed, exclusions: { colors: [white] } }], facts)).toBe(all);
    });

    it('kopya engeli hariç süzgecini de sayar; etikette hariç tutulanlar yazar', () => {
      expect(sameScope({ categoryId: 'pleksi' }, { categoryId: 'pleksi', exclusions: { colors: [white] } })).toBe(false);
      expect(sameScope({ categoryId: 'pleksi', exclusions: { colors: [white] } }, { categoryId: 'pleksi', exclusions: { colors: [white] } })).toBe(true);
      expect(ruleLabel({ categoryId: 'pleksi', category: { name: 'Pleksi' }, exclusions: { colors: [white], brands: [akp] } })).toBe(
        'Tüm Pleksi (Akpolimer, Beyaz hariç)',
      );
    });
  });
});
