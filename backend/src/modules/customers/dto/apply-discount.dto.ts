import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Cariye indirim (borç kapatma/yuvarlama) — CREDIT olarak işlenir. */
export class ApplyDiscountDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

/** Borcu kapatma: tahsil edilen tutar + kalan fark indirim olarak işlenir. */
export class SettleDebtDto {
  @IsNumber()
  @Min(0)
  paidAmount: number;
}
