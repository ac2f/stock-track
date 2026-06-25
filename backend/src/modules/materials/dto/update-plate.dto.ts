import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePlateDto } from './create-plate.dto';

/** templateId güncellemeyle değiştirilemez (plaka şablonuna bağlı kalır). */
export class UpdatePlateDto extends PartialType(
  OmitType(CreatePlateDto, ['templateId'] as const),
) {}
