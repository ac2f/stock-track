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
import { CreateMaterialSizeDto } from '../dto/create-material-size.dto';
import { UpdateMaterialSizeDto } from '../dto/update-material-size.dto';
import { MaterialSizesService } from '../services/material-sizes.service';
import { AnyShopMember, ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('material-sizes')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-sizes', version: '1' })
export class MaterialSizesController {
  constructor(private readonly sizesService: MaterialSizesService) {}

  @Post()
  create(@Body() dto: CreateMaterialSizeDto) {
    return this.sizesService.create(dto);
  }

  @AnyShopMember()
  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.sizesService.findAll(categoryId);
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sizesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialSizeDto,
  ) {
    return this.sizesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sizesService.remove(id);
  }
}
