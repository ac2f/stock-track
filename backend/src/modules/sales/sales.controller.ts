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
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { SalesService } from './sales.service';
import { ShopScope } from '../../common/shop/shop-access.decorator';

@ApiTags('sales')
@ApiBearerAuth()
@ShopScope('sales')
@Controller({ path: 'sales', version: '1' })
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // Satış çalışanın yetkisindedir; satışı yapan personel token'dan alınır.
  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser('id') userId: string) {
    return this.salesService.create(dto, userId);
  }

  @Get()
  findAll(@Query() query: QuerySaleDto) {
    return this.salesService.findAll(query);
  }

  /** Aralığın özeti: `{ count, saleTotal, businessMargin }` (sayfaya bağlı değil). */
  @Get('summary')
  summary(@Query() query: QuerySaleDto) {
    return this.salesService.summary(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findOne(id);
  }
}
