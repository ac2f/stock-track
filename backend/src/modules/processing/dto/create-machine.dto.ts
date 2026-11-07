import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

export class CreateMachineDto {
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

  /** Platformdaki makine türü (rehberde bulunabilmesi için). Boş = rehberde görünmez. */
  @IsOptional()
  @IsUUID()
  machineTypeId?: string | null;

  /** Hazır ebat (türe ait). Özel ebat için boş bırakıp en/boy yazın. */
  @IsOptional()
  @IsUUID()
  sizeId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  workWidthMm?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  workHeightMm?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string | null;
}
