import { api } from './client';

export type DebtBucket = '0-30' | '31-60' | '61-90' | '90+';

/** Başka bir işletmedeki borç uyarısı. TUTAR yoktur (sunucu göndermez). */
export interface DebtWarning {
  shopName: string;
  since: string;
  ageDays: number;
  bucket: DebtBucket;
  openItems: number;
}

export interface CustomerSuggestion {
  name: string;
  companyName: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  sources: number;
}

export interface PhoneLookup {
  phone: string | null;
  own: { id: string; name: string } | null;
  suggestion: CustomerSuggestion | null;
  debtWarnings: DebtWarning[];
  network: { customerInfo: boolean; debtInfo: boolean };
}

export async function lookupPhone(phone: string): Promise<PhoneLookup> {
  return (await api.get<PhoneLookup>('/customer-network/lookup', { params: { phone } })).data;
}

export async function fetchCustomerWarnings(
  customerId: string,
): Promise<{ debtWarnings: DebtWarning[]; network: { customerInfo: boolean; debtInfo: boolean } }> {
  return (await api.get(`/customer-network/customers/${customerId}`)).data;
}
