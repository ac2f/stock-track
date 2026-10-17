import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CurrentShop } from '../../common/decorators/current-shop.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AnyShopMember, NoShop } from '../../common/shop/shop-access.decorator';
import { SHOP_MODULE_LABELS, SHOP_MODULES } from '../../common/shop/shop-permissions';
import {
  AddMemberDto,
  CreateShopDto,
  UpdateMemberAccountDto,
  UpdateMemberDto,
  UpdateShopDto,
} from './dto/shop.dto';
import { ShopAccessInfo, ShopAccessService } from './shop-access.service';
import { ShopsService } from './shops.service';

/**
 * Dükkânlar ve ekipler. Dükkân seçimi gerektirmez: hangi dükkânın ekibi
 * düzenleniyorsa adreste yazar; yetkiyi servis denetler.
 */
@ApiTags('shops')
@ApiBearerAuth()
@NoShop()
@Controller({ path: 'shops', version: '1' })
export class ShopsController {
  constructor(
    private readonly shops: ShopsService,
    private readonly access: ShopAccessService,
  ) {}

  /** Oturumdaki kullanıcının girebildiği dükkânlar ve izinleri. */
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.access.listFor(user);
  }

  /** İzin alanlarının listesi ve adları (arayüzdeki izin tablosu). */
  @Get('modules')
  modules() {
    return SHOP_MODULES.map((key) => ({ key, label: SHOP_MODULE_LABELS[key] }));
  }

  /** Seçili dükkânın personeli (ödemeyi teslim alan vb. seçimler için). */
  @AnyShopMember()
  @Get('current/staff')
  staff(@CurrentShop() shop: ShopAccessInfo) {
    return this.shops.staff(shop.shopId);
  }

  /** Ekip ekranı: sistem sahibine tüm dükkânlar, yöneticiye yönettikleri. */
  @Get()
  manageable(@CurrentUser() user: AuthenticatedUser) {
    return this.shops.manageable(user);
  }

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateShopDto) {
    return this.shops.create(dto);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShopDto) {
    return this.shops.update(id, dto);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shops.listMembers(user, id);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.shops.addMember(user, id, dto);
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.shops.updateMember(user, id, memberId, dto);
  }

  @Patch(':id/members/:memberId/account')
  updateMemberAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberAccountDto,
  ) {
    return this.shops.updateMemberAccount(user, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.shops.removeMember(user, id, memberId);
  }
}
