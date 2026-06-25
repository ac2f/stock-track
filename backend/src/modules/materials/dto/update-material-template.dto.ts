import { PartialType } from '@nestjs/swagger';
import { CreateMaterialTemplateDto } from './create-material-template.dto';

export class UpdateMaterialTemplateDto extends PartialType(
  CreateMaterialTemplateDto,
) {}
