import { PartialType } from '@nestjs/swagger';
import { CreateMaterialColorDto } from './create-material-color.dto';

export class UpdateMaterialColorDto extends PartialType(CreateMaterialColorDto) {}
