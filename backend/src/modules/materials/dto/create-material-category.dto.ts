import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  MeasurementType,
  MATERIAL_MEASUREMENT_TYPES,
} from '../../../common/enums/measurement-type.enum';

export class CreateMaterialCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  /** Teknik slug — verilmezse addan otomatik üretilir (çakışırsa -2, -3…). */
  @IsOptional()
  @IsString()
  @MinLength(2)
  code?: string;

  @IsOptional()
  @IsIn(MATERIAL_MEASUREMENT_TYPES)
  defaultMeasurementType?: MeasurementType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
