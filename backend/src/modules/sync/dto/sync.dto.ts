import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateReplicaDto {
  @IsString()
  @Length(1, 120)
  name: string;

  /** Hizmet verdiği dükkânlar; boş/verilmezse hepsi. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  shopIds?: string[];
}

export class UpdateReplicaDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SnapshotQueryDto {
  @IsString()
  @MaxLength(63)
  table: string;

  @IsOptional()
  @IsUUID()
  afterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit = 500;
}

export class ChangesQueryDto {
  @Matches(/^\d{1,19}$/)
  since: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit = 1000;
}

export class RowsDto {
  @IsString()
  @MaxLength(63)
  table: string;

  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class ClientIdDto {
  @IsString()
  @MaxLength(63)
  table: string;

  @IsUUID('all')
  id: string;
}

export class PushOpDto {
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  opId: string;

  @IsIn(['user', 'corel'])
  actor: 'user' | 'corel';

  @IsOptional()
  @IsUUID('all')
  userId?: string | null;

  @IsUUID('all')
  shopId: string;

  @IsIn(['POST', 'PUT', 'PATCH', 'DELETE'])
  method: string;

  @IsString()
  @MaxLength(500)
  path: string;

  /** Asıl istek gövdesi (olduğu gibi). */
  @Allow()
  body?: unknown;

  @IsISO8601()
  occurredAt: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ClientIdDto)
  clientIds?: ClientIdDto[];

  @IsOptional()
  @IsObject()
  docNos?: Record<string, string>;
}

export class PushDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PushOpDto)
  ops: PushOpDto[];
}

export class OutboxQueryDto {
  @IsOptional()
  @IsIn(['pending', 'pushing', 'applied', 'rejected', 'discarded', 'uncertain', 'open'])
  state?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
