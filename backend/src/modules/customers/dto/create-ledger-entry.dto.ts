import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';

/**
 * Cariye elle (geçmiş tarihli) borç/alacak hareketi ekleme.
 *  - debit  → borç artışı (müşteri bize borçlanır)
 *  - credit → borç azalışı (alacak / iade)
 * occurredAt verilmezse bugün. Ekstre bu tarihe göre kronolojik gösterilir.
 */
export class CreateLedgerEntryDto {
  @IsEnum(LedgerEntryType)
  entryType: LedgerEntryType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
