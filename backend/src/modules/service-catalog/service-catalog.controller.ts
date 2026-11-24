import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopScope } from '../../common/shop/shop-access.decorator';
import { ServiceCatalogService } from './service-catalog.service';
import {
  CreateServiceBundleDto,
  CreateServiceGroupDto,
  CreateServiceTypeDto,
  UpdateServiceBundleDto,
  UpdateServiceGroupDto,
  UpdateServiceTypeDto,
} from './dto/service-catalog.dto';

/** Hizmet kataloğu: gruplar, hizmet türleri (fiyat kademeleriyle) ve kombinasyon indirimleri. */
@ApiTags('services')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'service-catalog', version: '1' })
export class ServiceCatalogController {
  constructor(private readonly service: ServiceCatalogService) {}

  @Get()
  catalog(@Query('active') active?: string) {
    return this.service.catalog(active === 'true' || active === '1');
  }

  @Post('groups')
  createGroup(@Body() dto: CreateServiceGroupDto) {
    return this.service.createGroup(dto);
  }

  @Patch('groups/:id')
  updateGroup(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceGroupDto) {
    return this.service.updateGroup(id, dto);
  }

  @Delete('groups/:id')
  removeGroup(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeGroup(id);
  }

  @Post('types')
  createType(@Body() dto: CreateServiceTypeDto) {
    return this.service.createType(dto);
  }

  @Patch('types/:id')
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceTypeDto) {
    return this.service.updateType(id, dto);
  }

  @Delete('types/:id')
  removeType(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeType(id);
  }

  @Post('bundles')
  createBundle(@Body() dto: CreateServiceBundleDto) {
    return this.service.createBundle(dto);
  }

  @Patch('bundles/:id')
  updateBundle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceBundleDto) {
    return this.service.updateBundle(id, dto);
  }

  @Delete('bundles/:id')
  removeBundle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeBundle(id);
  }
}
