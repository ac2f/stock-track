import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';

export class QueryQuoteDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  buyerCustomerId?: string;

  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  // Belirli bir malzemeyi (plaka) içeren teklifler.
  @IsOptional()
  @IsUUID()
  plateId?: string;

  // Malzeme TÜRÜ (kategori: pleksi, alüminyum kompozit…) içeren teklifler.
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // Oluşturulma tarihi aralığı. Hiçbir filtre verilmezse son 1 hafta gösterilir.
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
