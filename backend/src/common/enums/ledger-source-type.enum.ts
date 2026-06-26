/** Bir cari hareketinin kaynağı (hangi olaydan doğdu). */
export enum LedgerSourceType {
  OPENING = 'opening', // Açılış bakiyesi
  PROCESSING = 'processing', // İşleme/üretim faturalandı (DEBIT)
  SALE = 'sale', // Satış: alıcı borçlanır (DEBIT) / sahip alacaklanır (CREDIT)
  PAYMENT = 'payment', // Ödeme/tahsilat
  MANUAL_ADJUSTMENT = 'manual_adjustment', // Manuel düzeltme
}
