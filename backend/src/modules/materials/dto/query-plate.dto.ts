import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

/**
 * Stok kalemi için gelişmiş filtreleme: tür (kategori), ölçüm tipi, marka, renk,
 * depo, konsinye sahibi ve serbest metin araması.
 */
export class QueryPlateDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  ownerCustomerId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStock?: boolean; // true → yalnızca stoğu olanlar
}
