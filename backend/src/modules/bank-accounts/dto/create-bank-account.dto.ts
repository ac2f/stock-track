import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @MinLength(2)
  bankName: string;

  @IsString()
  @MinLength(2)
  accountName: string;

  @IsString()
  @MinLength(10)
  iban: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
