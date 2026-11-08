import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateMaterialTemplateDto } from '../dto/create-material-template.dto';
import {
  MergeMaterialTemplatesDto,
  UpdateMaterialTemplateDto,
} from '../dto/update-material-template.dto';
import { MaterialTemplatesService } from '../services/material-templates.service';
import { AnyShopMember, ShopAccess, ShopFeatureRequired, ShopScope } from '../../../common/shop/shop-access.decorator';
import { RateLimit } from '../../../common/cache/rate-limit';
import { TemplateCommunityService } from '../services/template-community.service';
import { CommunityTemplateQueryDto } from '../dto/community-template-query.dto';
import { Cached } from '../../../common/cache/cached.decorator';
import { CacheGroup } from '../../../common/cache/cache.groups';

@ApiTags('material-templates')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-templates', version: '1' })
export class MaterialTemplatesController {
  constructor(
    private readonly templatesService: MaterialTemplatesService,
    private readonly communityService: TemplateCommunityService,
  ) {}

  // Şablon tanımı kataloğu yönetir → Sahip yetkisi.
  @Post()
  create(@Body() dto: CreateMaterialTemplateDto) {
    return this.templatesService.create(dto);
  }

  /**
   * Yeni ürün türü eklerken: BAŞKA işletmelerde tanımlı benzer türler (yalnız katalog özellikleri,
   * işletme kimliği yok). Ticaret özelliği gerekir; katalog yazma izni olan kullanır.
   * (`:id` rotasından ÖNCE tanımlıdır.)
   */
  @ShopFeatureRequired('trade')
  @ShopAccess('catalog', 'write')
  @RateLimit({ name: 'template-community', by: 'user', limit: 60, windowSeconds: 60 })
  @Get('community')
  community(@Query() q: CommunityTemplateQueryDto) {
    return this.communityService.suggest(q);
  }

  @Cached({ group: CacheGroup.CATALOG, ttl: 600 })
  @AnyShopMember()
  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.templatesService.findAll({ categoryId, search });
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialTemplateDto,
  ) {
    return this.templatesService.update(id, dto);
  }

  /** Kopyaları bu türe birleştirir (stok kalemleri taşınır, silinmez). */
  @Post(':id/merge')
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeMaterialTemplatesDto,
  ) {
    return this.templatesService.merge(id, dto.sourceIds);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.remove(id);
  }
}
