import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { ProcessingStatus } from '../../../common/enums/processing-status.enum';

/**
 * İşleme kaydı oluşturma.
 *
 * Birim fiyat önceliği: overrideRatePerUnit (dinamik) > ratePresetId (şablon) >
 * sistem varsayılanı (config).
 *
 * Faturalama birimi (billingUnit) verilmezse malzemenin ölçüm tipinden alınır:
 *  - AREA   → en/boy gerekir (verilmezse plakadan); m² = en×boy×adet
 *  - LENGTH → lengthMeters gerekir; metre = lengthMeters×adet  (kutu harf)
 *  - PIECE  → adet
 */
export class CreateProcessingJobDto {
  @IsUUID()
  plateId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(MeasurementType)
  billingUnit?: MeasurementType;

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

  // LENGTH birimi için işlenen uzunluk (metre).
  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthMeters?: number;

  @IsOptional()
  @IsUUID()
  ratePresetId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overrideRatePerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraCost?: number = 0;

  // İşleme ücretinin para birimi (yabancı para ise baz tutara çevrilir).
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  // Stoğun düşeceği depo; verilmezse varsayılan (Merkez) depo.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // Üretim kuyruğu makinesi (opsiyonel).
  @IsOptional()
  @IsUUID()
  machineId?: string;

  // Başlangıç durumu (verilmezse: ertelemeli→pending, anında→completed).
  @IsOptional()
  @IsEnum(ProcessingStatus)
  status?: ProcessingStatus;

  // Varsayılan: işleme cariye borç olarak yansır.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  bill?: boolean = true;

  // true → iş PENDING kaydedilir; stok düşümü ve cari borç TAMAMLANINCA uygulanır.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  billOnCompletion?: boolean = false;

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

  /** Teklif dönüşümünde kaynak teklif id'si (kuyruktan teklife gitmek için). */
  @IsOptional()
  @IsUUID()
  quoteId?: string;
}
