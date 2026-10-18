import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { PriceUnit } from '../../../common/enums/price-unit.enum';

/**
 * Fiyat çatısının kapsamı. Kategori zorunlu, diğerleri boşsa "hepsi".
 * Marka/kalınlık/renk/ebat kategorinin kataloğundan seçilir; sunucu
 * kategoriyle eşleştiğini doğrular.
 */
export class PriceRuleScopeDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsUUID()
  thicknessId?: string | null;

  @IsOptional()
  @IsUUID()
  colorId?: string | null;

  @IsOptional()
  @IsUUID()
  sizeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  variant?: string | null;
}

export class CreatePriceRuleDto extends PriceRuleScopeDto {
  /** Malzemeci fiyatlarının birimi; verilmezse m² (ölçüsü adet olan türde tabaka/adet). */
  @IsOptional()
  @IsEnum(PriceUnit)
  unit?: PriceUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  markupPercent?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class UpdatePriceRuleDto extends PartialType(CreatePriceRuleDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Kapsam önizlemesi: kaç kalemi kapsar, aynısı var mı. */
export class PreviewPriceRuleDto extends PriceRuleScopeDto {
  /** Düzenlenen çatı (kendisiyle kopya sayılmasın). */
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}

/** Bir malzemecinin çatıdaki fiyatı. Malzemeci boşsa işletmenin liste fiyatı. */
export class UpsertPriceRuleEntryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsNumber()
  @Min(0)
  price: number;

  /** TRY ya da döviz (USD, EUR ...); hesapta son kurla TRY'ye çevrilir. */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;

  /** Bu fiyatı çatının referansı yap. */
  @IsOptional()
  @IsBoolean()
  makeReference?: boolean;
}

/** Referans fiyat seçimi; boş (null) en ucuza döner. */
export class SetPriceRuleReferenceDto {
  @IsOptional()
  @IsUUID()
  entryId?: string | null;
}
