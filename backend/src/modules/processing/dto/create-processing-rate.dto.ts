import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  MinLength,
} from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

export class CreateProcessingRateDto {
  @IsString()
  @MinLength(2)
  name: string;

  // Birim verilmezse AREA (m²) varsayılır.
  @IsOptional()
  @IsEnum(MeasurementType)
  unit?: MeasurementType;

  @IsNumber()
  @Min(0)
  ratePerUnit: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
