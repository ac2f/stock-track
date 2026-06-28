import { api } from './client';
import type { Warehouse } from '../types';

/** Depo listesi — stok kalemi eklerken/açılış stoğu için seçilir. */
export async function fetchWarehouses(): Promise<Warehouse[]> {
  const { data } = await api.get<Warehouse[]>('/warehouses');
  return data;
}
