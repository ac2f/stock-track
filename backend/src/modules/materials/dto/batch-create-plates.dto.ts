import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreatePlateDto } from './create-plate.dto';

/**
 * Tek bir stok kalemi — katalog kayıtları KİMLİK yerine ADLA da verilebilir.
 *
 * Ad verilip karşılığı yoksa kayıt kendiliğinden açılır (tür, marka, renk,
 * ebat, kalınlık ve gerekirse şablon). Böylece her malzeme/marka/renk için
 * önceden tek tek tanım yapmaya gerek kalmaz.
 */
export class BatchPlateItemDto extends CreatePlateDto {
  /** Şablon verilmediğinde kullanılır; yoksa açılır. */
  @IsOptional()
  @IsString()
  categoryName?: string;

  /** Şablonun adı (ör. "Dekota 3mm"); verilmezse özelliklerden türetilir. */
  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  colorName?: string;

  @IsOptional()
  @IsString()
  colorCode?: string;

  /** Kalınlık (mm) — kataloğda yoksa açılır. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  thicknessMm?: number;

  /** Standart tabaka eni (mm) — kataloğda yoksa ebat kaydı açılır. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  sheetWidthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sheetHeightMm?: number;

  /** Aynı özellikte kaç AYRI parça kaydı açılacak (varsayılan 1). */
  @IsOptional()
  @IsNumber()
  @Min(1)
  copies?: number;
}

/** Tek istekte birden çok stok kalemi. */
export class BatchCreatePlatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchPlateItemDto)
  items: BatchPlateItemDto[];
}

/** Toplu ekleme sonucu — hangi katalog kayıtlarının açıldığı da raporlanır. */
export interface BatchCreateResult {
  created: number;
  plateIds: string[];
  /** Bu işlem sırasında kendiliğinden açılan katalog kayıtları. */
  autoCreated: {
    categories: string[];
    brands: string[];
    colors: string[];
    sizes: string[];
    thicknesses: string[];
    templates: string[];
  };
}
