import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateShopDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** Katalog/ayarların kopyalanacağı mevcut dükkân. */
  @IsOptional()
  @IsUUID()
  copyFromShopId?: string;

  /** Malzeme türleri, şablonlar, marka/renk/ebat/kalınlık, tarifeler, makineler, gider türleri. */
  @IsOptional()
  @IsBoolean()
  copyCatalog?: boolean;

  /** Fiyat, kesim fiyatlandırması, görünüm ve işletme bilgileri (ad hariç). */
  @IsOptional()
  @IsBoolean()
  copySettings?: boolean;
}

export class UpdateShopDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Telegram kullanıcı kimliği (yalnız rakam); boş = bağlantıyı kaldır. */
  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{0,20}\s*$/, { message: 'Telegram kimliği yalnız rakamlardan oluşur (botta /idx).' })
  telegramUserId?: string;
}

/** Üye eklerken yeni hesap açmak için. */
export class NewMemberUserDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class AddMemberDto {
  /** Var olan kullanıcı (sistem sahibi listeden seçer). */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Var olan kullanıcı, e-postasıyla (dükkân yöneticisi). */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Yeni hesap açıp ekle. */
  @IsOptional()
  @ValidateNested()
  @Type(() => NewMemberUserDto)
  newUser?: NewMemberUserDto;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  /** { stock: { read: true, write: false }, ... } — bilinmeyen alanlar atılır. */
  @IsOptional()
  @IsObject()
  permissions?: Record<string, unknown>;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, unknown>;
}

export class UpdateMemberAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Telegram kullanıcı kimliği (yalnız rakam); boş = bağlantıyı kaldır. */
  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{0,20}\s*$/, { message: 'Telegram kimliği yalnız rakamlardan oluşur (botta /idx).' })
  telegramUserId?: string;
}
