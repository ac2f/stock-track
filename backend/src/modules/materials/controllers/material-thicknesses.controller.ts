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
import { CreateMaterialThicknessDto } from '../dto/create-material-thickness.dto';
import { UpdateMaterialThicknessDto } from '../dto/update-material-thickness.dto';
import { MaterialThicknessesService } from '../services/material-thicknesses.service';
import { AnyShopMember, ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('material-thicknesses')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-thicknesses', version: '1' })
export class MaterialThicknessesController {
  constructor(
    private readonly thicknessesService: MaterialThicknessesService,
  ) {}

  @Post()
  create(@Body() dto: CreateMaterialThicknessDto) {
    return this.thicknessesService.create(dto);
  }

  @AnyShopMember()
  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.thicknessesService.findAll(categoryId);
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.thicknessesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialThicknessDto,
  ) {
    return this.thicknessesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.thicknessesService.remove(id);
  }
}
