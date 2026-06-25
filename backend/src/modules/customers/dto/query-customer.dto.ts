import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Müşteri filtreleme — borç durumuna göre arama dahil.
 */
export class QueryCustomerDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasDebt?: boolean; // true → yalnızca bakiyesi > 0 olanlar

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  minDebt?: number;

  @IsOptional()
  @IsIn(['name', 'balance', 'recent'])
  sort?: 'name' | 'balance' | 'recent' = 'name';
}
