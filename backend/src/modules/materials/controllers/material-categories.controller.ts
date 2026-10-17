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
import { CreateMaterialCategoryDto } from '../dto/create-material-category.dto';
import { UpdateMaterialCategoryDto } from '../dto/update-material-category.dto';
import { MaterialCategoriesService } from '../services/material-categories.service';
import { AnyShopMember, ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('material-categories')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-categories', version: '1' })
export class MaterialCategoriesController {
  constructor(
    private readonly categoriesService: MaterialCategoriesService,
  ) {}

  @Post()
  create(@Body() dto: CreateMaterialCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @AnyShopMember()
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id);
  }
}
