import { BadRequestException } from '@nestjs/common';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { round, totalAreaM2 } from '../../common/utils/area.util';

export interface QuantityInput {
  billingUnit: MeasurementType;
  quantity: number;
  widthMm?: number | null;
  heightMm?: number | null;
  lengthMeters?: number | null;
}

/**
 * Faturalanan ölçü miktarını birime göre hesaplar (saf fonksiyon).
 *  - AREA   → m² = en × boy × adet
 *  - LENGTH → metre = uzunluk × adet   [kutu harf makineleri]
 *  - PIECE / WEIGHT → doğrudan adet/miktar
 *
 * Hem ProcessingService (gerçek kayıt) hem QuotesService (teklif tahmini) kullanır.
 */
export function computeQuantityValue(input: QuantityInput): number {
  const { billingUnit, quantity } = input;
  switch (billingUnit) {
    case MeasurementType.AREA: {
      if (input.widthMm == null || input.heightMm == null) {
        throw new BadRequestException(
          'm² hesabı için en ve boy (kalemde veya plakadan) tanımlı olmalıdır.',
        );
      }
      return totalAreaM2(Number(input.widthMm), Number(input.heightMm), quantity);
    }
    case MeasurementType.LENGTH: {
      if (input.lengthMeters == null) {
        throw new BadRequestException(
          'Metre bazlı işleme için lengthMeters (metre) zorunludur.',
        );
      }
      return round(input.lengthMeters * quantity, 4);
    }
    default:
      // PIECE / WEIGHT → doğrudan adet/miktar.
      return round(quantity, 4);
  }
}
