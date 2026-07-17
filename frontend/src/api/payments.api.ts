import { api } from './client';
import type {
  LegacyDebtClose,
  Payment,
  PaymentDirection,
  PaymentMethod,
} from '../types';

export interface CreatePaymentInput {
  amount: number;
  method: PaymentMethod;
  direction?: PaymentDirection;
  currency?: string;
  paymentDate?: string;
  receivedById?: string; // nakit → çalışan
  bankAccountId?: string; // havale → banka hesabı
  cardBusinessName?: string; // kart → işletme/POS adı
  referenceNo?: string;
  note?: string;
  closeDebt?: boolean; // tahsilattan sonra kalan borcu indirimle kapat
}

export async function fetchPayments(customerId: string): Promise<Payment[]> {
  const { data } = await api.get<Payment[]>(
    `/customers/${customerId}/payments`,
  );
  return data;
}

export async function createPayment(
  customerId: string,
  input: CreatePaymentInput,
): Promise<{ payment: Payment; currentBalance: number }> {
  const { data } = await api.post<{ payment: Payment; currentBalance: number }>(
    `/customers/${customerId}/payments`,
    input,
  );
  return data;
}

export interface UpdatePaymentInput {
  amount?: number;
  method?: PaymentMethod;
  paymentDate?: string;
  receivedById?: string;
  bankAccountId?: string;
  cardBusinessName?: string;
  note?: string;
}

/** Geçmiş ödemeyi düzenle (backend yalnızca son 3 günü kabul eder). */
export async function updatePayment(
  customerId: string,
  paymentId: string,
  input: UpdatePaymentInput,
): Promise<{ payment: Payment; currentBalance: number }> {
  const { data } = await api.patch<{ payment: Payment; currentBalance: number }>(
    `/customers/${customerId}/payments/${paymentId}`,
    input,
  );
  return data;
}

/** Geçmiş ödemeyi sil (backend yalnızca son 3 günü kabul eder). */
export async function deletePayment(
  customerId: string,
  paymentId: string,
): Promise<{ currentBalance: number }> {
  const { data } = await api.delete<{ currentBalance: number }>(
    `/customers/${customerId}/payments/${paymentId}`,
  );
  return data;
}

// ── Uyumluluk: eski "borç kapatma" hareketlerini gerçek ödemeye çevirme ──
export async function fetchLegacyDebtClosings(): Promise<LegacyDebtClose[]> {
  const { data } = await api.get<LegacyDebtClose[]>(
    '/payments/legacy-debt-closings',
  );
  return data;
}

export interface ConvertLegacyDebtCloseInput {
  method: PaymentMethod;
  paymentDate?: string;
  receivedById?: string;
  bankAccountId?: string;
  cardBusinessName?: string;
  note?: string;
}

export async function convertLegacyDebtClosing(
  ledgerEntryId: string,
  input: ConvertLegacyDebtCloseInput,
): Promise<Payment> {
  const { data } = await api.post<Payment>(
    `/payments/legacy-debt-closings/${ledgerEntryId}/convert`,
    input,
  );
  return data;
}

// ── Çalışan kasası / çapraz-müşteri ödeme sorgusu (#4, #5) ──
export interface CashCollection {
  employeeId: string;
  employeeName: string;
  count: number;
  total: number;
}

export async function fetchCashCollections(): Promise<CashCollection[]> {
  const { data } = await api.get<CashCollection[]>('/payments/cash-collections');
  return data;
}

export async function settleEmployeeCash(
  receivedById: string,
): Promise<{ settledCount: number; settledTotal: number }> {
  const { data } = await api.post<{ settledCount: number; settledTotal: number }>(
    '/payments/settle',
    { receivedById },
  );
  return data;
}

export interface PaymentQuery {
  receivedById?: string;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  settled?: boolean;
}

export async function queryPayments(
  filters: PaymentQuery,
): Promise<(Payment & { customer?: { name: string } })[]> {
  const { data } = await api.get<(Payment & { customer?: { name: string } })[]>(
    '/payments',
    { params: filters },
  );
  return data;
}
