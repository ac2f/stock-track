import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

// ── Etiketler ─────────────────────────────────────────────────────────

export class CreateLabelDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateLabelDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Makine türleri ────────────────────────────────────────────────────

export class CreateMachineTypeDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsUUID()
  labelId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateMachineTypeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsUUID()
  labelId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMachineTypeSizeDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  widthMm: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  heightMm: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateMachineTypeSizeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  heightMm?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

// ── İşletme profili (işletmenin kendi) ───────────────────────────────

export class UpdateBusinessProfileDto {
  /** İşletmenin görünen adı (dükkân adı). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(160)
  legalName?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  contactPerson?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  website?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(60)
  province?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  district?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  addressLine?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  directoryVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  shareDebtInfo?: boolean;

  @IsOptional()
  @IsBoolean()
  shareCustomerInfo?: boolean;

  /** Seçilen iş kolu etiketleri (tümü değiştirilir). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUUID('all', { each: true })
  labelIds?: string[];
}

// ── Kayıt (herkese açık) ─────────────────────────────────────────────

export class RegisterBusinessDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName: string;

  @Transform(trim)
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @MaxLength(160)
  email: string;

  @Transform(trim)
  @IsString()
  @MinLength(7, { message: 'Telefon numarasını girin.' })
  @MaxLength(40)
  phone: string;

  @IsString()
  @MinLength(8, { message: 'Parola en az 8 karakter olmalı.' })
  @MaxLength(100)
  password: string;

  @Transform(trim)
  @IsString()
  @MaxLength(60)
  province: string;

  @Transform(trim)
  @IsString()
  @MaxLength(80)
  district: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  addressLine?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  website?: string | null;

  /** En az bir iş kolu etiketi (yöneticinin tanımladıklarından). */
  @IsArray()
  @ArrayMinSize(1, { message: 'En az bir iş kolu seçin.' })
  @ArrayMaxSize(8)
  @IsUUID('all', { each: true })
  labelIds: string[];

  @Equals(true, { message: 'Kullanım koşullarını kabul etmelisiniz.' })
  acceptTerms: boolean;
}

// ── Platform yönetimi: işletmeler ve ayarlar ─────────────────────────

export class QueryBusinessesDto extends PaginationDto {
  @IsOptional()
  @IsIn(['pending', 'active', 'suspended'])
  status?: 'pending' | 'active' | 'suspended';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  /** true → kiralaması bitmiş ya da 7 gün içinde bitecekler. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  expiring?: boolean;
}

export class UpdateBusinessAdminDto {
  @IsOptional()
  @IsIn(['pending', 'active', 'suspended'])
  status?: 'pending' | 'active' | 'suspended';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  plan?: string;

  /** YYYY-AA-GG; null → süresiz. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tarih YYYY-AA-GG biçiminde olmalı.' })
  subscriptionUntil?: string | null;

  /** Bugünden / mevcut bitişten itibaren kaç gün uzatılsın (bitiş geçmişse bugünden). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  extendDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  directoryVisible?: boolean;
}

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @IsOptional()
  @IsBoolean()
  registrationAutoApprove?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  trialDays?: number;
}

// ── Rehber (üyeler için arama) ───────────────────────────────────────

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;

export class QueryDirectoryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  /** Virgülle ayrılmış etiket kimlikleri (herhangi biri). */
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  labelIds?: string[];

  /** Makine türü (alt türleri dahil). */
  @IsOptional()
  @IsUUID()
  machineTypeId?: string;

  /** En az bu çalışma alanına sahip makine (döndürerek de olur). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  minWidthMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  minHeightMm?: number;
}

export class DirectoryFacetsDto {
  /** Bu ildeki ilçeleri de say. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;
}
