import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { MaterialCategory } from '../../../common/enums/material-category.enum';

/**
 * Plaka için gelişmiş filtreleme.
 * Malzeme türü (kategori), marka, renge göre ve serbest metin araması yapılır.
 */
export class QueryPlateDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MaterialCategory)
  category?: MaterialCategory;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStock?: boolean; // true → yalnızca stoğu olanlar
}
