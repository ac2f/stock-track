import { roundMoney } from '../../common/utils/area.util';

/** Satış kalemi satır toplamı. */
export function lineTotalOf(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

/** Manuel yöntemde sahip payı = girilen tutar. */
export function ownerShareManual(amount: number): number {
  return roundMoney(amount);
}

/** Komisyon yönteminde sahip payı = satır × (1 − komisyon%/100). */
export function ownerShareCommission(
  lineTotal: number,
  commissionPercent: number,
): number {
  return roundMoney(lineTotal * (1 - commissionPercent / 100));
}

/** İşletme kârı = satış toplamı − sahip payı. */
export function businessMarginOf(
  saleTotal: number,
  ownerAmount: number,
): number {
  return roundMoney(saleTotal - ownerAmount);
}
