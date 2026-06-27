import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

export class CreateMaterialCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  code: string;

  @IsOptional()
  @IsEnum(MeasurementType)
  defaultMeasurementType?: MeasurementType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
