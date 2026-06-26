import { IsEnum } from 'class-validator';
import { ProcessingStatus } from '../../../common/enums/processing-status.enum';

export class UpdateProcessingStatusDto {
  @IsEnum(ProcessingStatus)
  status: ProcessingStatus;
}
