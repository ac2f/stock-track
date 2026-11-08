import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { RateLimit } from '../../../common/cache/rate-limit';
import { ShopAccess, ShopFeatureRequired, ShopScope } from '../../../common/shop/shop-access.decorator';
import { CustomerNetworkService } from '../services/customer-network.service';

class PhoneQueryDto {
  @IsString()
  @MaxLength(40)
  phone: string;
}

/**
 * İşletmeler arası müşteri ağı (aynı telefon). Numara taraması yapılamasın diye
 * kullanıcı başına dakikada 40 sorguyla sınırlıdır; her sorgu günlüğe (telefon
 * maskeli) yazılır.
 */
@ApiTags('customer-network')
@ApiBearerAuth()
@ShopScope('customers')
@ShopFeatureRequired('network')
@Controller({ path: 'customer-network', version: '1' })
export class CustomerNetworkController {
  constructor(private readonly network: CustomerNetworkService) {}

  /** Yeni müşteri kaydederken telefon yazılınca: öneri + başka işletmelerdeki borç uyarıları. */
  @ShopAccess('customers', 'write')
  @RateLimit({ name: 'phone-lookup', by: 'user', limit: 40, windowSeconds: 60, message: 'Çok sık sorgu yapıldı. Bir dakika bekleyin.' })
  @Get('lookup')
  lookup(@Query() q: PhoneQueryDto) {
    return this.network.lookup(q.phone);
  }

  /** Kayıtlı müşterinin başka işletmelerdeki borç uyarıları (müşteri kartı). */
  @Get('customers/:id')
  forCustomer(@Param('id', ParseUUIDPipe) id: string) {
    return this.network.warningsForCustomer(id);
  }
}
