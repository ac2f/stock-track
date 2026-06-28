import { PartialType } from '@nestjs/swagger';
import { CreateMaterialBrandDto } from './create-material-brand.dto';

export class UpdateMaterialBrandDto extends PartialType(CreateMaterialBrandDto) {}
