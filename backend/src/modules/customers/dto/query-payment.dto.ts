import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

/** Çapraz-müşteri ödeme sorgusu (çalışan/yöntem/tarih/tahsil durumu). */
export class QueryPaymentDto {
  @IsOptional()
  @IsUUID()
  receivedById?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // true → tahsil edilmiş, false → tahsil edilmemiş (çalışan üzerinde) ödemeler.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  settled?: boolean;
}

export class SettleCashDto {
  @IsUUID()
  receivedById: string;
}
