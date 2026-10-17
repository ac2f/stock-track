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
import { CreateMaterialBrandDto } from '../dto/create-material-brand.dto';
import { UpdateMaterialBrandDto } from '../dto/update-material-brand.dto';
import { MaterialBrandsService } from '../services/material-brands.service';
import { AnyShopMember, ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('material-brands')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-brands', version: '1' })
export class MaterialBrandsController {
  constructor(private readonly brandsService: MaterialBrandsService) {}

  @Post()
  create(@Body() dto: CreateMaterialBrandDto) {
    return this.brandsService.create(dto);
  }

  @AnyShopMember()
  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.brandsService.findAll(categoryId);
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialBrandDto,
  ) {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandsService.remove(id);
  }
}
