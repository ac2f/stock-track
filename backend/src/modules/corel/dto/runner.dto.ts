import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Runner'ın her turda gönderdiği nabız. */
export class RunnerHeartbeatDto {
  @IsString()
  @MaxLength(120)
  host: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(3600)
  pollSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  dayRoot?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dayRootSource?: string | null;

  /** Son turdaki sorun; boş/null → her şey yolunda. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string | null;
}

/** Runner bir teklifin klasörlerini açınca (ya da zaten açıksa) bildirir. */
export class JobFoldersDto {
  @IsString()
  @MaxLength(120)
  host: string;

  @IsString()
  @MaxLength(500)
  folder: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  report?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  problems?: string[];
}
