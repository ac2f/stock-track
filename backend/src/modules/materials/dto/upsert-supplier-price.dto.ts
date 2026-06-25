import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { PriceUnit } from '../../../common/enums/price-unit.enum';

/**
 * Bir tedarikçinin bu plaka için fiyatını ekler/günceller.
 * priceUpdatedAt servis tarafında otomatik 'şimdi' olarak yazılır.
 */
export class UpsertSupplierPriceDto {
  @IsUUID()
  supplierId: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsEnum(PriceUnit)
  unit?: PriceUnit;

  @IsOptional()
  @IsString()
  note?: string;
}
