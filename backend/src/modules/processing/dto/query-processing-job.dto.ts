import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ProcessingStatus } from '../../../common/enums/processing-status.enum';

export class QueryProcessingJobDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  plateId?: string;

  @IsOptional()
  @IsUUID()
  machineId?: string;

  // Kuyruk/geçmiş: malzeme türü (kategori) filtresi.
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // Kuyruk/geçmiş: serbest arama (plaka adı / müşteri adı).
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ProcessingStatus)
  status?: ProcessingStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
