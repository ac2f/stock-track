import { api } from './client';
import type { Paginated } from '../types';

export interface SaleItemRow {
  plateId: string;
  plate?: { name: string };
  quantity: number;
  widthMm?: number | null;
  heightMm?: number | null;
  unitPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  buyerCustomer?: { name: string };
  ownerCustomerId?: string | null;
  saleDate: string;
  currency: string;
  saleTotal: number;
  ownerAmount: number;
  businessMargin: number;
  note?: string | null;
  items: SaleItemRow[];
}

export interface SaleFilters {
  from?: string;
  to?: string;
  buyerCustomerId?: string;
  page?: number;
  limit?: number;
}

export async function fetchSales(filters: SaleFilters): Promise<Paginated<Sale>> {
  const { data } = await api.get<Paginated<Sale>>('/sales', { params: filters });
  return data;
}
