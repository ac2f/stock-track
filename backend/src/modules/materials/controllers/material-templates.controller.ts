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
import { MaterialCategory } from '../../../common/enums/material-category.enum';
import { CreateMaterialTemplateDto } from '../dto/create-material-template.dto';
import { UpdateMaterialTemplateDto } from '../dto/update-material-template.dto';
import { MaterialTemplatesService } from '../services/material-templates.service';

@ApiTags('material-templates')
@ApiBearerAuth()
@Controller({ path: 'material-templates', version: '1' })
export class MaterialTemplatesController {
  constructor(private readonly templatesService: MaterialTemplatesService) {}

  // Şablon tanımı kataloğu yönetir → Sahip yetkisi.
  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateMaterialTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Get()
  findAll(
    @Query('category') category?: MaterialCategory,
    @Query('search') search?: string,
  ) {
    return this.templatesService.findAll({ category, search });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialTemplateDto,
  ) {
    return this.templatesService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.remove(id);
  }
}
