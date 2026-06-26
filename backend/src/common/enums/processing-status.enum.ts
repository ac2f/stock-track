/**
 * İşleme kaydının üretim/atölye durumu (üretim kuyruğu).
 *  - PENDING     → kuyrukta, henüz başlanmadı.
 *  - IN_PROGRESS → işleniyor.
 *  - COMPLETED   → tamamlandı (gerekirse bu anda stok düşer + cariye borç yazılır).
 *  - CANCELLED   → iptal (tüketilen stok/borç varsa iade edilir).
 */
export enum ProcessingStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
