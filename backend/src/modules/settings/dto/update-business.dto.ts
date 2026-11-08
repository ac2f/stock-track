import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** İşletme/proje kimliği güncelleme — tüm alanlar opsiyonel (kısmi güncelleme). */
export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  businessPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  businessTaxNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  businessLogoPath?: string;

  /** Yalnız sistem sahibi değiştirir. Boş ya da http(s):// ile başlayan adres. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\s*(https?:\/\/[^\s<>"']+)?\s*$/i, {
    message: 'Portal adresi http:// ya da https:// ile başlamalı.',
  })
  portalBaseUrl?: string;
}
