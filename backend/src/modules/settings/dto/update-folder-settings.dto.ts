import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Dükkânın klasör oluşturucu (runner) ayarları; verilmeyen alan değişmez. */
export class UpdateFolderSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Belirteçteki işletme kodu; boş = dükkân adından. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsBoolean()
  materialSaleFolders?: boolean;

  /** Dükkân bilgisayarındaki gün klasörü kökü; boş = runner/eklenti ayarı. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dayRoot?: string;
}
