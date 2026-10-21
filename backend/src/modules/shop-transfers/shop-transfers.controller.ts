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
import {
  AnyShopMember,
  ShopAccess,
} from '../../common/shop/shop-access.decorator';
import type { ShopAccessInfo } from '../shops/shop-access.service';
import {
  CreateShopTransferDto,
  QueryShopTransferDto,
} from './dto/create-shop-transfer.dto';
import { ShopTransfersService } from './shop-transfers.service';

/**
 * Dükkânlar arası malzeme satışı. Seçili dükkân SATAN taraftır; alan dükkânda
 * stok girişi yetkisi ayrıca servis tarafından denetlenir.
 */
@ApiTags('shop-transfers')
@ApiBearerAuth()
@Controller({ path: 'shop-transfers', version: '1' })
export class ShopTransfersController {
  constructor(private readonly service: ShopTransfersService) {}

  /** Malzeme satılabilecek diğer dükkânlar. */
  @Get('targets')
  @ShopAccess('sales', 'write')
  targets(@CurrentUser() user: AuthenticatedUser) {
    return this.service.targets(user);
  }

  /**
   * Seçili dükkânın sattıkları (out: satış görme izni) ve aldıkları
   * (in: satın alma görme izni); izleme bilgisiyle birlikte.
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

  @Post()
  @ShopAccess('sales', 'write')
  create(
    @Body() dto: CreateShopTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  /** Hiçbir parçası kullanılmamış belgeyi geri alır (satan dükkândan). */
  @Post(':id/cancel')
  @ShopAccess('sales', 'write')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cancel(id, user);
  }
}
