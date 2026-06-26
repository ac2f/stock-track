import { api } from './client';
import type { CustomerAging, DashboardSummary } from '../types';

export async function fetchDashboard(): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/reports/dashboard');
  return data;
}

export async function fetchAging(): Promise<CustomerAging[]> {
  const { data } = await api.get<CustomerAging[]>('/reports/aging');
  return data;
}
