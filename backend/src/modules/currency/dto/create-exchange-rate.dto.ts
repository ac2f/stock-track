import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateExchangeRateDto {
  @IsString()
  @Length(3, 3)
  quoteCurrency: string; // ör. USD, EUR

  @IsNumber()
  @Min(0)
  rate: number; // 1 quote = rate × base

  @IsOptional()
  @IsString()
  @Length(3, 3)
  baseCurrency?: string; // verilmezse sistem baz para birimi

  @IsOptional()
  @IsDateString()
  asOf?: string;
}
