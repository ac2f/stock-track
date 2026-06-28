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
import { CreateMaterialColorDto } from '../dto/create-material-color.dto';
import { UpdateMaterialColorDto } from '../dto/update-material-color.dto';
import { MaterialColorsService } from '../services/material-colors.service';

@ApiTags('material-colors')
@ApiBearerAuth()
@Controller({ path: 'material-colors', version: '1' })
export class MaterialColorsController {
  constructor(private readonly colorsService: MaterialColorsService) {}

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateMaterialColorDto) {
    return this.colorsService.create(dto);
  }

  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.colorsService.findAll(categoryId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.colorsService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialColorDto,
  ) {
    return this.colorsService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.colorsService.remove(id);
  }
}
