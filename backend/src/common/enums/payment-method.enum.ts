/**
 * Ödeme yöntemi.
 * - CASH          → Nakit: parayı teslim alan çalışan (receivedBy) zorunlu.
 * - BANK_TRANSFER → Havale/EFT: hedef banka hesabı (bankAccount) zorunlu.
 */
export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
}
