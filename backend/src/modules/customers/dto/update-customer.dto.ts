import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';

/**
 * Açılış bakiyesi güncellemeyle değiştirilemez; bakiye yalnızca defter
 * hareketleriyle (işleme/ödeme/manuel düzeltme) değişir.
 */
export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['openingBalance'] as const),
) {}
