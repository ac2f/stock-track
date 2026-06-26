import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  Min,
} from 'class-validator';
import { MaterialCategory } from '../../../common/enums/material-category.enum';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

export class CreateMaterialTemplateDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(MaterialCategory)
  category: MaterialCategory;

  // Belirtilmezse AREA (tabaka, m²) varsayılır.
  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  @IsOptional()
  @IsString()
  defaultBrand?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultThicknessMm?: number;

  @IsOptional()
  @IsString()
  defaultColor?: string;

  @IsOptional()
  @IsString()
  defaultColorCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultWidthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultHeightMm?: number;

  @IsOptional()
  @IsObject()
  defaultAttributes?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  description?: string;
}
