import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * İşleme kaydı oluşturma.
 *
 * m² birim fiyatı için öncelik sırası:
 *   1) overrideRatePerM2 (işlem anında DİNAMİK girilen değer) — verilirse bu kullanılır.
 *   2) ratePresetId (önceden tanımlı SABİT şablon).
 *   3) sistem varsayılanı (config: DEFAULT_RATE_PER_M2).
 *
 * En/boy verilmezse plakanın ebadından alınır.
 */
export class CreateProcessingJobDto {
  @IsUUID()
  plateId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightMm?: number;

  @IsOptional()
  @IsUUID()
  ratePresetId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overrideRatePerM2?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraCost?: number = 0;

  // Varsayılan: işleme cariye borç olarak yansır.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  bill?: boolean = true;

  // Stoktan düşülsün mü (işlenen plaka adedi).
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  consumeStock?: boolean = true;

  @IsOptional()
  @IsDateString()
  processedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
