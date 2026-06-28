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
import { CreateMaterialSizeDto } from '../dto/create-material-size.dto';
import { UpdateMaterialSizeDto } from '../dto/update-material-size.dto';
import { MaterialSizesService } from '../services/material-sizes.service';

@ApiTags('material-sizes')
@ApiBearerAuth()
@Controller({ path: 'material-sizes', version: '1' })
export class MaterialSizesController {
  constructor(private readonly sizesService: MaterialSizesService) {}

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateMaterialSizeDto) {
    return this.sizesService.create(dto);
  }

  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.sizesService.findAll(categoryId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sizesService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialSizeDto,
  ) {
    return this.sizesService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sizesService.remove(id);
  }
}
