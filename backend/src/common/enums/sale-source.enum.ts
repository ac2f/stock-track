/**
 * Satılan malzemenin stok kaynağı.
 * - BUSINESS              → işletmenin kendi stoğu (stoktan düşülür).
 * - CONSIGNMENT_TRACKED   → sahibine ait, sistemde takip edilen konsinye stok (o sahibin stoğundan düşülür).
 * - THIRD_PARTY_UNTRACKED → sahibine ait ama stoğu takip edilmeyen malzeme (stok hareketi yok, sadece kayıt).
 */
export enum SaleStockSource {
  BUSINESS = 'business',
  CONSIGNMENT_TRACKED = 'consignment_tracked',
  THIRD_PARTY_UNTRACKED = 'third_party_untracked',
}

/**
 * Üçüncü kişinin malzemesi satıldığında sahibe yansıyan tutarın belirlenme yöntemi.
 * - MANUAL_AMOUNT      → sahibe verilecek tutar elle girilir.
 * - COMMISSION_PERCENT → işletme komisyon yüzdesini alır; kalanı sahibe yansır.
 */
export enum OwnerSettlementType {
  MANUAL_AMOUNT = 'manual_amount',
  COMMISSION_PERCENT = 'commission_percent',
}
