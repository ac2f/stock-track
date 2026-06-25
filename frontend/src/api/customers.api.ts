import { api } from './client';
import type { Customer, Paginated, PaymentMethod } from '../types';

export interface CustomerFilters {
  search?: string;
  hasDebt?: boolean;
  minDebt?: number;
  sort?: 'name' | 'balance' | 'recent';
  page?: number;
  limit?: number;
}

export async function fetchCustomers(
  filters: CustomerFilters,
): Promise<Paginated<Customer>> {
  const { data } = await api.get<Paginated<Customer>>('/customers', {
    params: filters,
  });
  return data;
}

export interface CreatePaymentInput {
  amount: number;
  method: PaymentMethod;
  receivedById?: string; // nakit
  bankAccountId?: string; // havale
  referenceNo?: string;
}

/** Tahsilat al; kalan borç anında döner. */
export async function createPayment(
  customerId: string,
  input: CreatePaymentInput,
): Promise<{ currentBalance: number }> {
  const { data } = await api.post<{ currentBalance: number }>(
    `/customers/${customerId}/payments`,
    input,
  );
  return data;
}
