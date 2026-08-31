import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

/** Perakende fiyat girişi. Para birimi verilmezse sistemin baz birimi (TRY). */
export class SetRetailPriceDto {
  @IsNumber()
  @Min(0)
  retailPrice: number;

  /** Desteklenen para birimleri — varsayılan TRY. */
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'])
  currency?: string;

  /** Bu malzemeye özel kâr yüzdesi; verilmezse ayarlardaki genel oran. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  markupPercent?: number;
}
