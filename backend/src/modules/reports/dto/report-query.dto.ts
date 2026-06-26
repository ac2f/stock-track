import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class AgingQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  // Yaşlandırmanın referans tarihi (varsayılan: bugün).
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class TopListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}
