import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemDto {
  @IsUUID()
  plateId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreatePurchaseDto {
  @IsUUID()
  supplierId: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  // Malların gireceği depo; verilmezse varsayılan (Merkez) depo.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // Belirtilmezse satın alma tarihi 'şimdi' kabul edilir.
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

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
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}
