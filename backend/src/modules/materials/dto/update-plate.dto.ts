import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePlateDto } from './create-plate.dto';

/**
 * templateId güncellemeyle değiştirilemez (plaka şablonuna bağlı kalır).
 * ownerCustomerId (sahiplik) düzenlemeyle değil, ayrı transfer ucuyla değişir.
 */
export class UpdatePlateDto extends PartialType(
  OmitType(CreatePlateDto, ['templateId', 'ownerCustomerId'] as const),
) {}
