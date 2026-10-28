import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Geçmiş (tamamlanmış) işlerin TOPLU düzenlemesi. Verilen alanlar seçilen
 * her işe uygulanır; verilmeyen alan dokunulmaz. Tutar/stok/faturalama
 * değişmez (cari tutarlılığı); faturalanmış işlerin ekstre tarihi yeni
 * tarihe taşınır.
 */
export class BulkUpdateProcessingJobsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];

  @IsOptional()
  @IsDateString()
  processedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  /** true → tamamlanma tarihi, her işin (yeni ya da mevcut) işlenme tarihine eşitlenir. */
  @IsOptional()
  sameDay?: boolean;

  /** Notu değiştirir (boş metin notu siler). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
