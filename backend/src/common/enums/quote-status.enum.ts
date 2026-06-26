/**
 * Teklif (proforma) yaşam döngüsü.
 *  - DRAFT     → taslak, henüz müşteriye sunulmadı.
 *  - SENT      → müşteriye gönderildi, yanıt bekleniyor.
 *  - ACCEPTED  → müşteri kabul etti; gerçeğe (satış/işleme) dönüştürülebilir.
 *  - REJECTED  → müşteri reddetti.
 *  - EXPIRED   → geçerlilik tarihi (validUntil) geçti.
 *  - CONVERTED → satış ve/veya işleme kaydına dönüştürüldü (kilitli).
 */
export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CONVERTED = 'converted',
}

/**
 * Teklif kalemi türü. Bir teklif karışık olabilir:
 *  - SALE       → malzeme satışı (onayda Satış kaydına gider).
 *  - PROCESSING → işleme/hizmet (onayda İşleme kaydına gider; metrekare/metre/adet).
 */
export enum QuoteLineKind {
  SALE = 'sale',
  PROCESSING = 'processing',
}
