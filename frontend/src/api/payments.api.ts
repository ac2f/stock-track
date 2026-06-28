import { api } from './client';
import type { Payment, PaymentDirection, PaymentMethod } from '../types';

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
