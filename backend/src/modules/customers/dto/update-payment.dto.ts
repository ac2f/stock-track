import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

/**
 * Geçmiş bir ödemenin düzenlenmesi (yalnızca son 3 gün içinde kaydedilenler).
 * Verilmeyen alanlar korunur. Yöntem değişirse yöntem-özel alan da güncellenir.
 * receivedById/bankAccountId/cardBusinessName için boş string ("") gönderilirse
 * ilgili alan temizlenir.
 */
export class UpdatePaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

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
