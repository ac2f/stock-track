import { BadRequestException } from '@nestjs/common';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { computeQuantityValue } from './processing-calc.util';

describe('processing-calc.util — computeQuantityValue', () => {
  it('AREA: m² = en(mm)×boy(mm)×adet (m² cinsinden)', () => {
    // 2000mm × 1000mm = 2 m², 3 adet → 6 m²
    expect(
      computeQuantityValue({
        billingUnit: MeasurementType.AREA,
        quantity: 3,
        widthMm: 2000,
        heightMm: 1000,
      }),
    ).toBe(6);
  });

  it('LENGTH: metre = uzunluk × adet (kutu harf)', () => {
    // 12.5 m × 2 = 25 m
    expect(
      computeQuantityValue({
        billingUnit: MeasurementType.LENGTH,
        quantity: 2,
        lengthMeters: 12.5,
      }),
    ).toBe(25);
  });

  it('PIECE: doğrudan adet', () => {
    expect(
      computeQuantityValue({ billingUnit: MeasurementType.PIECE, quantity: 7 }),
    ).toBe(7);
  });

  it('WEIGHT: doğrudan miktar', () => {
    expect(
      computeQuantityValue({
        billingUnit: MeasurementType.WEIGHT,
        quantity: 12.5,
      }),
    ).toBe(12.5);
  });

  it('AREA: en/boy yoksa hata verir', () => {
    expect(() =>
      computeQuantityValue({
        billingUnit: MeasurementType.AREA,
        quantity: 1,
        widthMm: 1000,
      }),
    ).toThrow(BadRequestException);
  });

  it('LENGTH: lengthMeters yoksa hata verir', () => {
    expect(() =>
      computeQuantityValue({
        billingUnit: MeasurementType.LENGTH,
        quantity: 1,
      }),
    ).toThrow(BadRequestException);
  });
});
