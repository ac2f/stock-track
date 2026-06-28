import { PartialType } from '@nestjs/swagger';
import { CreateMaterialSizeDto } from './create-material-size.dto';

export class UpdateMaterialSizeDto extends PartialType(CreateMaterialSizeDto) {}
