import { PartialType } from '@nestjs/swagger';
import { CreateMaterialThicknessDto } from './create-material-thickness.dto';

export class UpdateMaterialThicknessDto extends PartialType(
  CreateMaterialThicknessDto,
) {}
