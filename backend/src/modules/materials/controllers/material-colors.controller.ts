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
import { CreateMaterialColorDto } from '../dto/create-material-color.dto';
import { UpdateMaterialColorDto } from '../dto/update-material-color.dto';
import { MaterialColorsService } from '../services/material-colors.service';
import { AnyShopMember, ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('material-colors')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-colors', version: '1' })
export class MaterialColorsController {
  constructor(private readonly colorsService: MaterialColorsService) {}

  @Post()
  create(@Body() dto: CreateMaterialColorDto) {
    return this.colorsService.create(dto);
  }

  @AnyShopMember()
  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.colorsService.findAll(categoryId);
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.colorsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialColorDto,
  ) {
    return this.colorsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.colorsService.remove(id);
  }
}
