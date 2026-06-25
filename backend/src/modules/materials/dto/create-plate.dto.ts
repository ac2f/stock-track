import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Plaka oluşturma. Yalnızca templateId zorunludur; en/boy/kalınlık/marka/renk
 * verilmezse şablonun varsayılanlarından miras alınır (servis katmanında).
 */
export class CreatePlateDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  colorCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  thicknessMm?: number;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityInStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
}
