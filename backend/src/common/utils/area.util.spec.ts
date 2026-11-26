import {
  mmToSquareMeters,
  roundMoney,
  totalAreaM2,
} from './area.util';

describe('area.util', () => {
  describe('mmToSquareMeters', () => {
    it('2000mm x 1000mm = 2 m²', () => {
      expect(mmToSquareMeters(2000, 1000)).toBeCloseTo(2);
    });

    it('pozitif olmayan ölçülerde hata fırlatır', () => {
      expect(() => mmToSquareMeters(0, 1000)).toThrow();
      expect(() => mmToSquareMeters(2000, -5)).toThrow();
    });
  });

  describe('totalAreaM2', () => {
    it('adetle çarparak toplam alanı verir', () => {
      // 1.5m x 1m = 1.5 m², 4 adet → 6 m²
      expect(totalAreaM2(1500, 1000, 4)).toBeCloseTo(6);
    });

    it('adet pozitif olmalıdır', () => {
      expect(() => totalAreaM2(1500, 1000, 0)).toThrow();
    });
  });

  describe('roundMoney', () => {
    it('2 ondalığa yuvarlar ve kayan nokta hatasını giderir', () => {
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
      // 1.005 ikili kayan noktada 1.00499...'tir; EPSILON düzeltmesi sayesinde
      // hatalı şekilde 1.00'a değil, doğru biçimde 1.01'e yuvarlanır.
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(95.126)).toBe(95.13);
    });
  });
});

describe('alan: kare olmayan ebat ve sınırlar', () => {
  it('en × boy (kare olmayan) ve adet', () => {
    expect(mmToSquareMeters(500, 2000)).toBe(1);
    expect(mmToSquareMeters(1220, 2440)).toBeCloseTo(2.9768, 10);
    expect(totalAreaM2(250, 4000, 3)).toBe(3);
  });
  it('sıfır ya da eksi ölçü ve adet reddedilir', () => {
    expect(() => mmToSquareMeters(0, 100)).toThrow();
    expect(() => mmToSquareMeters(100, -1)).toThrow();
    expect(() => totalAreaM2(100, 100, 0)).toThrow();
  });
});
