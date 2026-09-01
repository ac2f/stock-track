import { Type } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Ekstre sütunlarının uygulamadaki alanlara eşlemesi. */
export class ColumnMappingDto {
  @IsString()
  date: string;

  /** Tek sütunda işaretli tutar (ya da debit/credit çifti). */
  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  debit?: string;

  @IsOptional()
  @IsString()
  credit?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  counterpartyIban?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  balanceAfter?: string;
}

export class ImportStatementDto {
  @IsUUID()
  bankAccountId: string;

  /** Ekstrenin CSV metni (arayüz dosyayı okuyup gönderir). */
  @IsString()
  @MinLength(2)
  csv: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ColumnMappingDto)
  mapping: ColumnMappingDto;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class ConfirmMatchDto {
  @IsIn(['payment', 'expense'])
  type: string;

  @IsUUID()
  matchId: string;
}
