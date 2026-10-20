import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMaterialColorDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsUUID()
  categoryId: string;

  /** Rengin markası (kod o markanınsa); boş = bütün markalarda geçerli. */
  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
