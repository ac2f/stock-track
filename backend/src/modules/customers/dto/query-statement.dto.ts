import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { CustomerLedgerEntry } from '../entities/customer-ledger-entry.entity';

/** Ekstrenin hangi dönemi kapsadığı. */
export type StatementScope = 'since-settlement' | 'all' | 'custom';

/**
 * Cari ekstre dönemi.
 *  - varsayılan → borcun en son kapandığı andan bugüne,
 *  - scope=all  → tüm geçmiş,
 *  - from/to    → serbest aralık (borç kapanmadan öncesi de görülebilir).
 */
export class QueryStatementDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['since-settlement', 'all'])
  scope?: 'since-settlement' | 'all';
}

/** Dönemlenmiş cari ekstre. */
export interface CustomerStatement {
  /** Dönemdeki hareketler (eskiden yeniye). */
  entries: CustomerLedgerEntry[];
  /** Dönem başındaki bakiye (devir). */
  openingBalance: number;
  /** Dönem sonundaki bakiye. */
  closingBalance: number;
  /** Borcun en son kapandığı (bakiyenin sıfırlandığı) an; yoksa null. */
  lastSettledAt: string | null;
  /** Dönemin fiilen başladığı ilk hareket tarihi. */
  from: string | null;
  to: string | null;
  scope: StatementScope;
  /** Dönemden önce hareket var mı (devir satırı gösterilmeli mi). */
  hasEarlier: boolean;
  /** Caride toplam hareket sayısı ("tümünü göster" için ipucu). */
  totalCount: number;
}
