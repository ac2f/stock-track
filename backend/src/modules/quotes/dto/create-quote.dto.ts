import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../../common/enums/sale-source.enum';
import { QuoteLineKind } from '../../../common/enums/quote-status.enum';

export class QuoteItemDto {
  @IsEnum(QuoteLineKind)
  lineKind: QuoteLineKind;

  @IsUUID()
  plateId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  // SALE: birim satış fiyatı; PROCESSING: birim işleme ücreti (rate).
  @IsNumber()
  @Min(0)
  unitPrice: number;

  // Kaleme özel işlenme/teslim tarihi (opsiyonel). Dönüşümde işleme işinin
  // processedAt'ine / satışın saleDate'ine yansır.
  @IsOptional()
  @IsDateString()
  itemDate?: string;

  // ── PROCESSING kalemi ──
  @IsOptional()
  @IsEnum(MeasurementType)
  billingUnit?: MeasurementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthMeters?: number;

  // ── SALE kalemi ──
  @IsOptional()
  @IsEnum(SaleStockSource)
  stockSource?: SaleStockSource;

  @IsOptional()
  @IsEnum(OwnerSettlementType)
  ownerSettlement?: OwnerSettlementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ownerAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;
}

export class CreateQuoteDto {
  @IsUUID()
  buyerCustomerId: string;

  @IsOptional()
  @IsUUID()
  ownerCustomerId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];
}
