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
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CreateMaterialCategoryDto } from '../dto/create-material-category.dto';
import { UpdateMaterialCategoryDto } from '../dto/update-material-category.dto';
import { MaterialCategoriesService } from '../services/material-categories.service';

@ApiTags('material-categories')
@ApiBearerAuth()
@Controller({ path: 'material-categories', version: '1' })
export class MaterialCategoriesController {
  constructor(
    private readonly categoriesService: MaterialCategoriesService,
  ) {}

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateMaterialCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id);
  }
}
