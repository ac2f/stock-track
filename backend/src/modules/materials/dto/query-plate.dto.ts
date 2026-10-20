import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
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

  /** Kalınlık (mm); 2.8 ile 2.80 aynıdır. */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber()
  thicknessMm?: number;

  /** Renk kaydı (ad + kod); aynı adlı farklı kodlar ayrı süzülür. */
  @IsOptional()
  @IsUUID()
  colorId?: string;

  /** Standart tabaka ebadı (kalemin ebadı ya da ürün türünün varsayılanı). */
  @IsOptional()
  @IsUUID()
  sizeId?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  ownerCustomerId?: string;

  // Bu müşteriye ait (stoktaki) malzemeleri HARİÇ tut — satış kaleminde alıcının
  // kendi malzemesinin yanlışlıkla satılmasını engellemek için.
  @IsOptional()
  @IsUUID()
  excludeOwnerCustomerId?: string;

  // Sahiplik filtresi: 'business' → işletme stoğu, 'customer' → konsinye (herhangi).
  @IsOptional()
  @IsIn(['business', 'customer'])
  owner?: 'business' | 'customer';

  // Stoğa giriş (added_at) tarihi aralığı — işleme malzemesini kolay bulmak için.
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStock?: boolean; // true → yalnızca stoğu olanlar
}
