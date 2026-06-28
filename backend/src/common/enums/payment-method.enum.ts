/**
 * Ödeme yöntemi.
 * - CASH          → Nakit: parayı teslim alan çalışan (receivedBy) zorunlu.
 * - BANK_TRANSFER → Havale/EFT: hedef banka hesabı (bankAccount) zorunlu.
 * - CARD          → Kart: ödemenin geçtiği işletme/POS adı (cardBusinessName) serbest metin.
 */
export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
}
