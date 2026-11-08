import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Ortak katalogda benzer ürün türü arama: yazılan özellikler (hepsi isteğe bağlı, en az biri sunucuca aranır). */
export class CommunityTemplateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brandName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  colorName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  thicknessMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sheetWidthMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sheetHeightMm?: number;
}
