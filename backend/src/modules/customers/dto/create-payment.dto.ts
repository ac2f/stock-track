import {
  IsBoolean,
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
import { PaymentDirection } from '../../../common/enums/payment-direction.enum';

/**
 * Ödeme alma/verme. method'a göre koşullu zorunluluklar servis katmanında doğrulanır:
 *  - cash          → receivedById zorunlu.
 *  - bank_transfer → bankAccountId zorunlu.
 * direction verilmezse INCOMING (tahsilat) varsayılır.
 */
export class CreatePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentDirection)
  direction?: PaymentDirection;

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

  // Kart ile ödemede işletme/POS adı (serbest metin).
  @IsOptional()
  @IsString()
  cardBusinessName?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  // "Borç kapa": tahsilattan sonra kalan borç varsa, kalan fark İNDİRİM olarak
  // yazılıp cari borcu sıfırlanır (yön=incoming iken anlamlıdır).
  @IsOptional()
  @IsBoolean()
  closeDebt?: boolean;
}
