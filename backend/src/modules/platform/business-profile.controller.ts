import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../../common/decorators/current-shop.decorator';
import { AnyShopMember, ShopScope } from '../../common/shop/shop-access.decorator';
import { ShopAccessInfo } from '../shops/shop-access.service';
import { BusinessProfileService } from './business-profile.service';
import { UpdateBusinessProfileDto } from './dto/platform.dto';

/**
 * İşletmenin kendi profili: iletişim, il/ilçe, iş kolları, rehber ve paylaşım
 * tercihleri. Okumayı her üye yapar; değiştirmek "Dükkân ayarları" yazma izni ister.
 */
@ApiTags('business-profile')
@ApiBearerAuth()
@ShopScope('settings')
@Controller({ path: 'business-profile', version: '1' })
export class BusinessProfileController {
  constructor(private readonly profile: BusinessProfileService) {}

  @AnyShopMember()
  @Get()
  get(@CurrentShop() shop: ShopAccessInfo) {
    return this.profile.get(shop.shopId);
  }

  @Patch()
  update(@CurrentShop() shop: ShopAccessInfo, @Body() dto: UpdateBusinessProfileDto) {
    return this.profile.update(shop.shopId, dto);
  }
}
