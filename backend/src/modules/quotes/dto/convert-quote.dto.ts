import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ConvertQuoteDto {
  /**
   * true → dönüşüm sonrası her işleme işi hemen COMPLETED yapılır (stok düşer +
   * faturalanır). Kullanıcı isteği: "kuyruğa eklenen eşyalar eklendiği gibi
   * tamamlanmış gibi gösterme".
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  completeProcessing?: boolean = false;
}
