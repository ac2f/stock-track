import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Müşteri filtreleme — borç durumuna göre arama + kayıt tarihi aralığı.
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

  // Kayıt (oluşturulma) tarihi aralığı — büyük veride sayfayı daraltmak için.
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['name', 'balance', 'recent'])
  sort?: 'name' | 'balance' | 'recent' = 'name';
}
