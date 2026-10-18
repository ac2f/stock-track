import { PartialType } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { CreateMaterialTemplateDto } from './create-material-template.dto';

export class UpdateMaterialTemplateDto extends PartialType(
  CreateMaterialTemplateDto,
) {}

/** Bu türe birleştirilecek kopya ürün türleri. */
export class MergeMaterialTemplatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  sourceIds: string[];
}
