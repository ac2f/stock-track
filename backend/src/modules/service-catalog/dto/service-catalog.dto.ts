import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

export class CreateServiceGroupDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateServiceGroupDto extends PartialType(CreateServiceGroupDto) {}

export class ServiceTierDto {
  /** Var olan kademe (güncelleme); yoksa yeni kademe. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minMeasure?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxMeasure?: number | null;

  @IsOptional()
  @IsEnum(MeasurementType)
  unit?: MeasurementType | null;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;
}

export class CreateServiceTypeDto {
  @IsUUID()
  groupId: string;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsEnum(MeasurementType)
  unit: MeasurementType;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  measureLabel?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Fiyat kademeleri (en az bir): verilen liste kademelerin tamamıdır (listede olmayan silinir). */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceTierDto)
  tiers: ServiceTierDto[];
}
export class UpdateServiceTypeDto extends PartialType(CreateServiceTypeDto) {}

export class CreateServiceBundleDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('all', { each: true })
  serviceTypeIds: string[];

  @IsIn(['percent', 'fixed'])
  discountKind: 'percent' | 'fixed';

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateServiceBundleDto extends PartialType(CreateServiceBundleDto) {}
