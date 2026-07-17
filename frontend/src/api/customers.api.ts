import { api } from './client';
import type {
  Customer,
  CustomerLedgerEntry,
  Paginated,
  PaymentMethod,
} from '../types';

export interface CustomerFilters {
  search?: string;
  hasDebt?: boolean;
  minDebt?: number;
  from?: string; // kayıt tarihi aralığı (YYYY-MM-DD)
  to?: string;
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

export interface CreateCustomerInput {
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  openingBalance?: number;
}

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<Customer> {
  const { data } = await api.post<Customer>('/customers', input);
  return data;
}

/** Tek müşteri (güncel bakiye dahil). */
export async function fetchCustomer(id: string): Promise<Customer> {
  const { data } = await api.get<Customer>(`/customers/${id}`);
  return data;
}

/**
 * Portal erişim linki üretir (varsa yeniler): müşteri borç/ekstre görüntüleme.
 * Dönen url backend'in PORTAL_BASE_URL'ine göredir; arayüz kendi origin'iyle
 * de kurabilir: `${window.location.origin}/portal/${token}`.
 */
export async function issuePortalLink(
  id: string,
): Promise<{ token: string; url: string }> {
  const { data } = await api.post<{ token: string; url: string }>(
    `/customers/${id}/portal-token`,
  );
  return data;
}

/** Portal erişimini iptal eder (link geçersizleşir). */
export async function revokePortalLink(id: string): Promise<void> {
  await api.delete(`/customers/${id}/portal-token`);
}

export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, 'openingBalance'>>;

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<Customer> {
  const { data } = await api.patch<Customer>(`/customers/${id}`, input);
  return data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

// ── #8b Cari ekstre + geçmiş tarihli borç/alacak ──
export async function fetchCustomerLedger(
  id: string,
): Promise<CustomerLedgerEntry[]> {
  const { data } = await api.get<CustomerLedgerEntry[]>(`/customers/${id}/ledger`);
  return data;
}

export interface LedgerEntryInput {
  entryType: 'debit' | 'credit';
  amount: number;
  occurredAt?: string;
  description?: string;
}

export async function addCustomerLedgerEntry(
  id: string,
  input: LedgerEntryInput,
): Promise<Customer> {
  const { data } = await api.post<Customer>(`/customers/${id}/ledger-entry`, input);
  return data;
}

export interface DiscountInput {
  amount: number;
  description?: string;
  occurredAt?: string;
}

/** #5 İndirim (borç kapatma/yuvarlama) — ekstrede "İndirim" olarak görünür. */
export async function applyCustomerDiscount(
  id: string,
  input: DiscountInput,
): Promise<Customer> {
  const { data } = await api.post<Customer>(`/customers/${id}/discount`, input);
  return data;
}

export interface SettleDebtInput {
  paidAmount: number;
  method?: PaymentMethod;
  paymentDate?: string;
  receivedById?: string;
  bankAccountId?: string;
  cardBusinessName?: string;
  note?: string;
}

/**
 * #5 Borcu kapat: tahsil edilen tutar (varsa) GERÇEK bir ödeme olarak (ödeme
 * geçmişinde görünür), kalan fark İNDİRİM olarak tek işlemde işlenir; borç
 * sıfırlanır. paidAmount=0 ise hiç para almadan kapatma (tamamı indirim).
 */
export async function settleCustomerDebt(
  id: string,
  input: SettleDebtInput,
): Promise<Customer> {
  const { data } = await api.post<Customer>(`/customers/${id}/settle`, input);
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
