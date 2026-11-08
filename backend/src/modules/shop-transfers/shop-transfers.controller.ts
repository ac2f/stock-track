import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CurrentShop } from '../../common/decorators/current-shop.decorator';
import { RateLimit } from '../../common/cache/rate-limit';
import {
  AnyShopMember,
  ShopAccess,
  ShopFeatureRequired,
} from '../../common/shop/shop-access.decorator';
import type { ShopAccessInfo } from '../shops/shop-access.service';
import {
  CreateShopTransferDto,
  QueryShopTransferDto,
} from './dto/create-shop-transfer.dto';
import { PartnerSearchDto, RequestShopTransferDto, TransferDecisionDto } from './dto/trade.dto';
import { ShopTransfersService } from './shop-transfers.service';
import { PrimaryOnly } from '../sync/sync.decorators';

/** Teklif/talep açmayı yavaşlatır: bir kullanıcı saatte en çok 40 (toplu spam ve tarama denemesine karşı). */
const PROPOSE_LIMIT = { name: 'trade-propose', by: 'user' as const, limit: 40, windowSeconds: 3600, message: 'Çok sayıda teklif gönderdiniz; bir süre sonra tekrar deneyin.' };

/**
 * İşletmeler arası satış. Her işletme herhangi bir işletmeye satış teklifi (satıcı) ya da
 * paylaşılan stoğundan alım talebi (alıcı) gönderebilir; belge KARŞI TARAF onaylayana kadar
 * "onay bekliyor" kalır, hiçbir stok/cari kaydı yazılmaz. Kendi şubeleri arasında ya da karşı
 * işletmenin "otomatik onayla" yetkisi varsa doğrudan tamamlanır. Onay/ret/geri alma yetkisi
 * ilgili tarafın satış (satıcı) / satın alma (alıcı) YAZMA iznine bağlıdır (serviste denetlenir).
 * Sistem sahibinin işletmeye açtığı "ticaret" özelliği gerekir.
 */
@ApiTags('shop-transfers')
@ApiBearerAuth()
@ShopFeatureRequired('trade')
@Controller({ path: 'shop-transfers', version: '1' })
export class ShopTransfersController {
  constructor(private readonly service: ShopTransfersService) {}

  /** Teklif/talep edilebilecek işletmeler (kendi şubelerim, rehberdekiler, ilişkide olduklarım). */
  @Get('targets')
  @AnyShopMember()
  targets(
    @Query() q: PartnerSearchDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentShop() shop: ShopAccessInfo,
  ) {
    return this.service.targets(user, shop, q.q);
  }

  /** Karar bekleyen / başlattığım bekleyen işlem sayısı (menü rozeti). */
  @Get('pending-count')
  @AnyShopMember()
  pendingCount(@CurrentShop() shop: ShopAccessInfo) {
    return this.service.pendingCount(shop);
  }

  /**
   * Seçili dükkânın sattıkları (out: satış görme izni) ve aldıkları (in: satın alma görme izni);
   * `status=open` karar bekleyenler; izleme bilgisiyle birlikte.
   */
  @Get()
  @AnyShopMember()
  findAll(
    @Query() query: QueryShopTransferDto,
    @CurrentShop() shop: ShopAccessInfo,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(query, shop, user);
  }

  @Get(':id')
  @AnyShopMember()
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shop: ShopAccessInfo,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findOne(id, user, shop);
  }

  /** Satış teklifi (satıcı olarak). İki dükkânı değiştirir: yerel sunucuda yapılmaz (docs/SYNC.md). */
  @PrimaryOnly()
  @RateLimit(PROPOSE_LIMIT)
  @Post()
  @ShopAccess('sales', 'write')
  create(
    @Body() dto: CreateShopTransferDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentShop() shop: ShopAccessInfo,
  ) {
    return this.service.create(dto, user, shop);
  }

  /** Alım talebi (alıcı olarak): kalemler satıcının bu işletmeye açtığı paylaşılan stoktan seçilir. */
  @PrimaryOnly()
  @RateLimit(PROPOSE_LIMIT)
  @Post('request')
  @ShopAccess('purchases', 'write')
  request(
    @Body() dto: RequestShopTransferDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentShop() shop: ShopAccessInfo,
  ) {
    return this.service.request(dto, user, shop);
  }

  /** Karşı tarafın onayı (ya da karşı tarafın istediği geri almayı uygular). */
  @PrimaryOnly()
  @Post(':id/approve')
  @AnyShopMember()
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentShop() shop: ShopAccessInfo,
  ) {
    return this.service.approve(id, user, shop, dto);
  }

  /** Karşı tarafın reddi (bekleyen teklif ya da geri alma talebi). */
  @PrimaryOnly()
  @Post(':id/reject')
  @AnyShopMember()
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentShop() shop: ShopAccessInfo,
  ) {
    return this.service.reject(id, user, shop, dto.note);
  }

  /** Bekleyen teklifi geri çek / tamamlanmış belgeyi geri al (ya da karşı onayıyla geri alma talebi aç). */
  @PrimaryOnly()
  @Post(':id/cancel')
  @AnyShopMember()
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentShop() shop: ShopAccessInfo,
  ) {
    return this.service.cancel(id, user, shop, dto.note);
  }
}
