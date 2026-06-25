import { PartialType } from '@nestjs/swagger';
import { CreateProcessingRateDto } from './create-processing-rate.dto';

export class UpdateProcessingRateDto extends PartialType(
  CreateProcessingRateDto,
) {}
