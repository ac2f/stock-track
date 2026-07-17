import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

/**
 * Eski "borç kapatma" cari hareketini gerçek bir ödemeye çevirme.
 * Ödeme yöntemi (ve yönteme göre teslim alan çalışan / banka hesabı / POS adı)
 * ödeme formundaki gibi girilir. paymentDate verilmezse hareketin (borç kapatma)
 * tarihi varsayılır.
 */
export class ConvertLegacyDebtCloseDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

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
