import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { ProcessingStatus } from '../../../common/enums/processing-status.enum';

export class UpdateProcessingStatusDto {
  @IsEnum(ProcessingStatus)
  status: ProcessingStatus;

  /**
   * İş bitiminde pazarlıkla belirlenen NİHAİ tutar (işlem para biriminde).
   * Verilirse işin toplam ücreti bu değere güncellenir ve faturalama
   * (tamamlanınca) bu tutar üzerinden yapılır. Yalnızca COMPLETED'da anlamlıdır.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  finalAmount?: number;
}
