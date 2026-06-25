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

/**
 * Ödeme alma. method'a göre koşullu zorunluluklar servis katmanında doğrulanır:
 *  - cash          → receivedById zorunlu.
 *  - bank_transfer → bankAccountId zorunlu.
 */
export class CreatePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

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
  referenceNo?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
