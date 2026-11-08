import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../../common/decorators/current-shop.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShopAccess, ShopFeatureRequired, ShopScope } from '../../common/shop/shop-access.decorator';
import { PrimaryOnly } from '../sync/sync.decorators';
import type { ShopAccessInfo } from '../shops/shop-access.service';
import {
  ListingQueryDto,
  SetAllStockSharesDto,
  UpdateStockShareDto,
  UpsertPartnerGrantDto,
  UpsertStockShareDto,
} from './dto/trade.dto';
import { PartnerGrantsService } from './partner-grants.service';
import { StockSharesService } from './stock-shares.service';

/**
 * İşletmeler arası yetkiler (otomatik onayla / stoğumu görebilir / engelle; süreli ya da süresiz).
 * Okuma "Dükkân ayarları" okuma izni; yazma işletme YÖNETİCİSİ (serviste denetlenir).
 */
@ApiTags('partners')
@ApiBearerAuth()
@ShopFeatureRequired('trade')
@ShopScope('settings')
@Controller({ path: 'partners', version: '1' })
export class PartnersController {
  constructor(private readonly grants: PartnerGrantsService) {}

  /** Verdiğim ve bana tanınan (geçerli) yetkiler. Engeller karşı tarafa gösterilmez. */
  @Get('grants')
  list(@CurrentShop() shop: ShopAccessInfo) {
    return this.grants.list(shop.shopId);
  }

  @PrimaryOnly()
  @Put('grants')
  upsert(@Body() dto: UpsertPartnerGrantDto, @CurrentShop() shop: ShopAccessInfo, @CurrentUser() user: AuthenticatedUser) {
    return this.grants.upsert(shop, dto, user.id);
  }

  @PrimaryOnly()
  @Delete('grants/:id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentShop() shop: ShopAccessInfo): Promise<void> {
    await this.grants.remove(shop, id);
  }
}

/** "Bende var, satıyorum": kendi stok paylaşım kurallarım. Stok alanının izniyle. */
@ApiTags('stock-shares')
@ApiBearerAuth()
@ShopFeatureRequired('trade')
@ShopScope('stock')
@Controller({ path: 'stock-shares', version: '1' })
export class StockSharesController {
  constructor(private readonly shares: StockSharesService) {}

  @Get()
  list() {
    return this.shares.list();
  }

  /** Kalem / ürün türü / malzeme türü için paylaşım kuralı ekler ya da günceller. */
  @PrimaryOnly()
  @Put()
  upsert(@Body() dto: UpsertStockShareDto) {
    return this.shares.upsert(dto);
  }

  /** Tüm paylaşımı tek tuşla aç/kapat. */
  @PrimaryOnly()
  @Post('set-all')
  setAll(@Body() dto: SetAllStockSharesDto) {
    return this.shares.setAll(dto.isActive);
  }

  @PrimaryOnly()
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockShareDto) {
    return this.shares.update(id, dto);
  }

  @PrimaryOnly()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.shares.remove(id);
  }
}

/** Pazar yeri: diğer işletmelerin BU işletmeye listelediği stok ("bende var"). Satın alma okuma izniyle. */
@ApiTags('marketplace')
@ApiBearerAuth()
@ShopFeatureRequired('trade')
@Controller({ path: 'marketplace', version: '1' })
export class MarketplaceController {
  constructor(private readonly shares: StockSharesService) {}

  @Get('listings')
  @ShopAccess('purchases', 'read')
  listings(@Query() q: ListingQueryDto, @CurrentShop() shop: ShopAccessInfo) {
    return this.shares.browse(shop.shopId, q);
  }
}
