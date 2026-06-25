/** Bir cari hareketinin kaynağı (hangi olaydan doğdu). */
export enum LedgerSourceType {
  OPENING = 'opening', // Açılış bakiyesi
  PROCESSING = 'processing', // İşleme/üretim faturalandı (DEBIT)
  PAYMENT = 'payment', // Müşteri ödemesi (CREDIT)
  MANUAL_ADJUSTMENT = 'manual_adjustment', // Manuel düzeltme
}
