import { IsBoolean, IsOptional } from 'class-validator';

/** Arayüz görünüm tercihleri. */
export class UpdateDisplayDto {
  /**
   * Cari ekstresinde "Geri al" düğmeleri görünsün mü?
   * Kapalıyken yalnızca düğmeler gizlenir — yetki kuralları değişmez.
   */
  @IsOptional()
  @IsBoolean()
  showLedgerUndo?: boolean;
}
