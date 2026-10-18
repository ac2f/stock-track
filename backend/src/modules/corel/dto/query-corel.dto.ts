import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** Eklentinin müşteri/malzeme aramaları. */
export class QueryCorelDto {
  /** Serbest arama; Türkçe harfe duyarsız ("ozturk" → "Öztürk"). */
  @IsOptional()
  @IsString()
  q?: string;

  /** Malzeme listesinde bu müşterinin stoğu en üste gelir. */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Runner: bu andan (dahil) sonra işe dönüştürülen teklifler. */
export class QueryCorelJobsDto {
  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
