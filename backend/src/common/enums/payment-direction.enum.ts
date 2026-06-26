/**
 * Ödeme yönü.
 * - INCOMING → tahsilat: müşteriden para alınır (cari borcu azalır → CREDIT).
 * - OUTGOING → ödeme: malzeme sahibine/müşteriye para verilir (alacağı azalır → DEBIT).
 */
export enum PaymentDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}
