import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ShopTransferItemDto {
  /** Satan (seçili) dükkândaki stok kalemi. */
  @IsUUID()
  plateId: string;

  /** Tabakada parça sayısı; şeritte metre; diğerlerinde adet/kg. */
  @IsNumber()
  @Min(0.01)
  quantity: number;

  /** Tabakada m² başına, diğerlerinde ölçü birimi başına fiyat. */
  @IsNumber()
  @Min(0)
  unitPrice: number;

  /** Tabakadan parça satılıyorsa parça ölçüsü (verilmezse kalan tabakanın tamamı). */
  @IsOptional()
  @IsNumber()
  @Min(1)
  widthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  heightMm?: number;
}

export class CreateShopTransferDto {
  /** Malzemeyi alan dükkân. */
  @IsUUID()
  toShopId: string;

  /** Malzemenin çıktığı depo (satan dükkân); verilmezse varsayılan depo. */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShopTransferItemDto)
  items: ShopTransferItemDto[];
}

export class QueryShopTransferDto extends PaginationDto {
  /** out: bu dükkânın sattıkları; in: bu dükkânın aldıkları; boş: ikisi. */
  @IsOptional()
  @IsIn(['out', 'in'])
  direction?: 'out' | 'in';
}
