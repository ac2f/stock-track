import { api } from './client';
import type { CustomerAging, DashboardSummary } from '../types';

export interface DashboardFilters {
  from?: string; // YYYY-MM-DD
  to?: string;
}

export async function fetchDashboard(
  filters: DashboardFilters = {},
): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/reports/dashboard', {
    params: filters,
  });
  return data;
}

export async function fetchAging(): Promise<CustomerAging[]> {
  const { data } = await api.get<CustomerAging[]>('/reports/aging');
  return data;
}
