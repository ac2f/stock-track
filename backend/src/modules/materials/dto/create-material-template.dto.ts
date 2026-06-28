import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

export class CreateMaterialTemplateDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsUUID()
  categoryId: string;

  // Belirtilmezse AREA (tabaka, m²) varsayılır.
  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  // Kategori bazlı kataloglardan seçilir; sunucu, kategorinin şablonunkiyle
  // eşleştiğini doğrular (örn. Pleksi şablonunda Kompozit markası reddedilir).
  @IsOptional()
  @IsUUID()
  defaultBrandId?: string;

  @IsOptional()
  @IsUUID()
  defaultColorId?: string;

  @IsOptional()
  @IsUUID()
  defaultSizeId?: string;

  @IsOptional()
  @IsUUID()
  defaultThicknessId?: string;

  @IsOptional()
  @IsString()
  defaultVariant?: string;

  @IsOptional()
  @IsObject()
  defaultAttributes?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
