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
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../../common/enums/sale-source.enum';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

export class SaleItemDto {
  // Stoktaki malzeme seçildiğinde plaka kimliği. Serbest (stoksuz) satış
  // kaleminde boş bırakılır → stok hareketi olmaz, yalnızca cariye yansır.
  @IsOptional()
  @IsUUID()
  plateId?: string;

  // Serbest (stoksuz) kalemde malzemenin adı — fiş/ekstrede görünür.
  @IsOptional()
  @IsString()
  itemName?: string;

  // Serbest kalemde fiyatlama birimi (m²/metre/adet). Plaka varsa ölçüm tipinden gelir.
  @IsOptional()
  @IsEnum(MeasurementType)
  billingUnit?: MeasurementType;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  // Plaka seçilen kalemde stok kaynağı zorunludur; serbest kalemde verilmez.
  @IsOptional()
  @IsEnum(SaleStockSource)
  stockSource?: SaleStockSource;

  // Kalem notu — cari ekstrede satış açıklamasına eklenir.
  @IsOptional()
  @IsString()
  description?: string;

  // Tabaka (AREA) malzemede satılan parçanın ebadı (mm). Stoktan kalan boy
  // bu parçanın boyu kadar (tam genişlikte şerit) otomatik düşülür.
  @IsOptional()
  @IsNumber()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightMm?: number;

  // Üçüncü kişi malzemesinde (stockSource != business) gereklidir.
  @IsOptional()
  @IsEnum(OwnerSettlementType)
  ownerSettlement?: OwnerSettlementType;

  // ownerSettlement = manual_amount → sahibe verilecek tutar.
  @IsOptional()
  @IsNumber()
  @Min(0)
  ownerAmount?: number;

  // ownerSettlement = commission_percent → işletme komisyon yüzdesi (0–100).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;
}

export class CreateSaleDto {
  @IsUUID()
  buyerCustomerId: string;

  // Satılan malzeme üçüncü kişiye aitse sahibi (müşteri).
  @IsOptional()
  @IsUUID()
  ownerCustomerId?: string;

  // Stok düşülecek kaynak depo; verilmezse varsayılan (Merkez) depo.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

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
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
