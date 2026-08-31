import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Satış fiyatlandırma ayarları (yüzde değerleri). */
export class UpdatePricingDto {
  /** Perakende fiyatın üzerine eklenen genel kâr yüzdesi. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  saleMarkupPercent?: number;

  /** Başkasının malzemesi satılırken varsayılan komisyon yüzdesi. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  consignmentCommissionPercent?: number;
}
