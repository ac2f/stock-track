import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';

export class QueryQuoteDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  buyerCustomerId?: string;

  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;
}
