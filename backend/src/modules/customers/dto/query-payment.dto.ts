import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
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

/**
 * Bir müşterinin ödeme geçmişi: yöntem/tarih süzgeci ve isteğe bağlı
 * sayfalama. `page` ya da `limit` verilirse yanıt sayfalıdır
 * (`{ items, meta }`); verilmezse eskisi gibi düz liste döner.
 */
export class QueryCustomerPaymentsDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
