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
import { AnyShopMember, ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('material-templates')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-templates', version: '1' })
export class MaterialTemplatesController {
  constructor(private readonly templatesService: MaterialTemplatesService) {}

  // Şablon tanımı kataloğu yönetir → Sahip yetkisi.
  @Post()
  create(@Body() dto: CreateMaterialTemplateDto) {
    return this.templatesService.create(dto);
  }

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
