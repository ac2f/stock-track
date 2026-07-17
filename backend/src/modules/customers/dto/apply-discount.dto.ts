import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

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

/**
 * Borcu kapatma: tahsil edilen tutar (varsa) gerçek bir ödeme olarak, kalan fark
 * İNDİRİM olarak işlenir; borç sıfırlanır.
 *  - paidAmount = 0 → hiç para alınmadan borç kapatma (tamamı indirim).
 *  - paidAmount > 0 → yöntem (nakit/havale/kart) ve yönteme göre teslim alan
 *    çalışan / banka hesabı / POS adı zorunlu olur (ödeme formundaki gibi).
 */
export class SettleDebtDto {
  @IsNumber()
  @Min(0)
  paidAmount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsUUID()
  receivedById?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  cardBusinessName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
