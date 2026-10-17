import { IsBoolean } from 'class-validator';

/** Sabah özetini aç/kapat. */
export class UpdateMorningSummaryDto {
  @IsBoolean()
  enabled: boolean;
}
