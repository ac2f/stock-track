import { api } from './client';
import type { BankAccount } from '../types';

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  const { data } = await api.get<BankAccount[]>('/bank-accounts');
  return data;
}

export interface BankAccountInput {
  bankName: string;
  accountName: string;
  iban: string;
  currency?: string;
}

export async function createBankAccount(
  input: BankAccountInput,
): Promise<BankAccount> {
  const { data } = await api.post<BankAccount>('/bank-accounts', input);
  return data;
}

export async function deleteBankAccount(id: string): Promise<void> {
  await api.delete(`/bank-accounts/${id}`);
}
