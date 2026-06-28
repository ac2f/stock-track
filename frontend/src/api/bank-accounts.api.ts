import { api } from './client';
import type { BankAccount } from '../types';

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  const { data } = await api.get<BankAccount[]>('/bank-accounts');
  return data;
}
