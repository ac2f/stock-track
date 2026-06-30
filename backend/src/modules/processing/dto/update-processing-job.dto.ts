import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * Tamamlanmış/var olan bir işleme kaydının düzenlenebilir alanları: işlenme ve
 * tamamlanma tarihleri ile not. (Tutar/faturalama değişmez — cari tutarlılığı için.)
 */
export class UpdateProcessingJobDto {
  @IsOptional()
  @IsDateString()
  processedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
