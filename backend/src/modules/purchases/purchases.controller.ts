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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { QueryPurchaseDto } from './dto/query-purchase.dto';
import { PurchasesService } from './purchases.service';
import { ShopScope } from '../../common/shop/shop-access.decorator';

@ApiTags('purchases')
@ApiBearerAuth()
@ShopScope('purchases')
@Controller({ path: 'purchases', version: '1' })
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  // Satın alma & stok girişi çalışanın yetkisindedir.
  // Satın almayı yapan personel oturum sahibinden (token) alınır.
  @Post()
  create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.purchasesService.create(dto, userId);
  }

  @Get()
  findAll(@Query() query: QueryPurchaseDto) {
    return this.purchasesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchasesService.findOne(id);
  }
}
