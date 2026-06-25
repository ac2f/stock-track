/**
 * Cari defter hareket tipi.
 * - DEBIT  → Borç artışı (örn. bir işleme/satış faturalandı).
 * - CREDIT → Borç azalışı (örn. müşteri ödeme yaptı).
 */
export enum LedgerEntryType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}
