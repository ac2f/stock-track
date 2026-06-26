import {
  businessMarginOf,
  lineTotalOf,
  ownerShareCommission,
  ownerShareManual,
} from './sale-calc.util';

describe('sale-calc.util', () => {
  it('satır toplamı = adet × birim fiyat', () => {
    expect(lineTotalOf(4, 250)).toBe(1000);
  });

  it('manuel sahip payı = girilen tutar (yuvarlanmış)', () => {
    expect(ownerShareManual(750.005)).toBe(750.01);
  });

  it('komisyon yöntemi: %20 komisyonda sahip payı = satır × 0.80', () => {
    // 1000 satır, %20 işletme komisyonu → sahibe 800
    expect(ownerShareCommission(1000, 20)).toBe(800);
  });

  it('işletme kârı = satış − sahip payı', () => {
    expect(businessMarginOf(1000, 800)).toBe(200);
  });

  it('komisyon senaryosunda kâr komisyon tutarına eşittir', () => {
    const line = lineTotalOf(10, 100); // 1000
    const owner = ownerShareCommission(line, 15); // 850
    expect(businessMarginOf(line, owner)).toBe(150); // %15 komisyon = 150
  });
});
