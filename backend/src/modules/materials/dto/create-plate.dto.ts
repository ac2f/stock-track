import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  MeasurementType,
  UnitOfMeasure,
} from '../../../common/enums/measurement-type.enum';

/**
 * Stok kalemi oluşturma. Yalnızca templateId zorunludur; ölçüm tipi, birim,
 * en/boy/kalınlık/marka/renk verilmezse şablonun varsayılanlarından miras alınır.
 * Rulo/şerit (LENGTH) malzemede en/boy gerekmez; yükseklik/malzeme `attributes`'ta.
 */
export class CreatePlateDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  colorCode?: string;

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
  thicknessMm?: number;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  // Açılış stoğu (opsiyonel). Verilirse ilgili depoya işletme stoğu olarak yazılır.
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityInStock?: number;

  // Açılış stoğunun gireceği depo; verilmezse varsayılan (Merkez) depo.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
}
