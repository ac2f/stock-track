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
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CreateMaterialBrandDto } from '../dto/create-material-brand.dto';
import { UpdateMaterialBrandDto } from '../dto/update-material-brand.dto';
import { MaterialBrandsService } from '../services/material-brands.service';

@ApiTags('material-brands')
@ApiBearerAuth()
@Controller({ path: 'material-brands', version: '1' })
export class MaterialBrandsController {
  constructor(private readonly brandsService: MaterialBrandsService) {}

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateMaterialBrandDto) {
    return this.brandsService.create(dto);
  }

  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.brandsService.findAll(categoryId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandsService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialBrandDto,
  ) {
    return this.brandsService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandsService.remove(id);
  }
}
