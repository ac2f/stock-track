import { IsEnum } from 'class-validator';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';

export class UpdateQuoteStatusDto {
  @IsEnum(QuoteStatus)
  status: QuoteStatus;
}
