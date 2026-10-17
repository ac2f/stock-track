import { BadRequestException } from '@nestjs/common';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { round, totalAreaM2 } from '../../common/utils/area.util';

export interface QuantityInput {
  billingUnit: MeasurementType;
  quantity: number;
  widthMm?: number | null;
  heightMm?: number | null;
  lengthMeters?: number | null;
  /** TIME: işin toplam süresi (dakika). */
  durationMinutes?: number | null;
}

/**
 * Faturalanan ölçü miktarını birime göre hesaplar (saf fonksiyon).
 *  - AREA   → m² = en × boy × adet
 *  - LENGTH → metre = uzunluk × adet   [kutu harf makineleri]
 *  - TIME   → saat = süre (dk) / 60 — süre işin TOPLAMIDIR, adetle çarpılmaz
 *             (adet işlenen plaka sayısıdır, stok için). Süre yoksa adet dakika.
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
      // Metre bazlı işlemede lengthMeters verilmemişse quantity'yi metre kabul et
      // (satış tarafındaki fallback ile tutarlı) — "lengthMeters zorunludur"
      // hatası vermeden şerit/rulo işi kuyruğa eklenebilsin.
      if (input.lengthMeters == null) {
        return round(quantity, 4);
      }
      return round(input.lengthMeters * quantity, 4);
    }
    case MeasurementType.TIME: {
      const minutes =
        input.durationMinutes != null ? Number(input.durationMinutes) : quantity;
      return round(minutes / 60, 4);
    }
    default:
      // PIECE / WEIGHT → doğrudan adet/miktar.
      return round(quantity, 4);
  }
}

/**
 * Süreyle faturalanan işte asgari süre: "iş en az X dakikadan başlar".
 * Girilen süre bundan kısaysa asgari süre faturalanır. Kayda FATURALANAN süre
 * yazılır; böylece teklif, işleme ve belgeler aynı süreyi gösterir.
 */
export function billedMinutes(
  minutes: number | null | undefined,
  minMinutes: number | null | undefined,
): number | null {
  if (minutes == null) return null;
  const min = Number(minMinutes) || 0;
  return round(Math.max(Number(minutes), min), 2);
}
