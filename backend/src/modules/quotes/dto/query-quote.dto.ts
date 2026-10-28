import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

  // Teklif tarihi aralığı (geriye dönük kayıtta girilen tarih; yoksa kayıt tarihi). Hiçbir filtre verilmezse son 1 hafta gösterilir.
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // Teklif numarası (TKF-2026-0001) ya da müşteri adına göre arama (hızlı arama).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
