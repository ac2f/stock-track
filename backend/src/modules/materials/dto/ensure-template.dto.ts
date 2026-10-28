import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';

/**
 * Ürün türünü (şablonu) ÖZELLİKLERİNDEN bul ya da aç — stok eklemeden, teklif
 * formundan, arama sonucu boş çıktığında "bu ürün türünü kaydet" için.
 * Tür/marka/renk/kalınlık/ebat yoksa kendiliğinden açılır; aynı özellikte tür
 * zaten varsa o döner (kopya açılmaz).
 */
export class EnsureTemplateDto {
  @IsString()
  @MinLength(1)
  categoryName: string;

  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  colorName?: string;

  @IsOptional()
  @IsString()
  colorCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  thicknessMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sheetWidthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sheetHeightMm?: number;

  /** Alt tür / varyant (ör. Dökme); türde varsayılan olarak saklanır. */
  @IsOptional()
  @IsString()
  variant?: string;

  /** Türün adı; verilmezse özelliklerden türetilir. */
  @IsOptional()
  @IsString()
  templateName?: string;
}
