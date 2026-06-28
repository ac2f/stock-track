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
import { CreateMaterialThicknessDto } from '../dto/create-material-thickness.dto';
import { UpdateMaterialThicknessDto } from '../dto/update-material-thickness.dto';
import { MaterialThicknessesService } from '../services/material-thicknesses.service';

@ApiTags('material-thicknesses')
@ApiBearerAuth()
@Controller({ path: 'material-thicknesses', version: '1' })
export class MaterialThicknessesController {
  constructor(
    private readonly thicknessesService: MaterialThicknessesService,
  ) {}

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateMaterialThicknessDto) {
    return this.thicknessesService.create(dto);
  }

  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.thicknessesService.findAll(categoryId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.thicknessesService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialThicknessDto,
  ) {
    return this.thicknessesService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.thicknessesService.remove(id);
  }
}
