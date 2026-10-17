import { IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Kesim fiyatlandırması: süreyle ve m² ile fiyatın ücretleri ve asgarileri,
 * Corel eklentisinin süre hesabında kullandığı makine hızları.
 */
export class UpdateCutPricingDto {
  /** Süreyle faturalanan işin saatlik ücreti. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  /** İş en az bu kadar dakikadan faturalanır. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minMinutes?: number;

  /** m² ile fiyatta m² ücreti. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  areaRate?: number;

  /** İş en az bu kadar m²'den faturalanır. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minArea?: number;

  /** Kesim (ilerleme) hızı, mm/sn. */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  feedMmS?: number;

  /** Boşta gezme hızı, mm/sn. */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  rapidMmS?: number;

  /** Her konturda dalma/kalkma için eklenen süre, saniye. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  plungeSec?: number;

  /** Bir pasoda inilen derinlik (mm); 0 = tek paso. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  passDepthMm?: number;
}
