import { api } from './client';
import type { Paginated } from '../types';
import type { Supplier } from './suppliers.api';

export interface PurchaseItemRow {
  plateId: string;
  plate?: { name: string; measurementType?: string };
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  supplier?: Supplier;
  supplierId: string;
  purchasedBy?: { fullName: string };
  warehouse?: { name: string };
  purchaseDate: string;
  currency: string;
  totalAmount: number;
  note?: string | null;
  items: PurchaseItemRow[];
}

export interface PurchaseFilters {
  supplierId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function fetchPurchases(
  filters: PurchaseFilters,
): Promise<Paginated<PurchaseOrder>> {
  const { data } = await api.get<Paginated<PurchaseOrder>>('/purchases', {
    params: filters,
  });
  return data;
}

export interface PurchaseItemInput {
  plateId: string;
  quantity: number; // tabaka/adet malzemede adet; şeritte metre
  unitPrice: number;
}

export interface CreatePurchaseInput {
  supplierId: string;
  warehouseId?: string;
  purchaseDate?: string; // YYYY-MM-DD; boşsa şimdi
  currency?: string;
  note?: string;
  items: PurchaseItemInput[];
}

/** Alım kaydı oluşturur; kalemler AYNI transaction'da stoğa (işletme) girer. */
export async function createPurchase(
  input: CreatePurchaseInput,
): Promise<PurchaseOrder> {
  const { data } = await api.post<PurchaseOrder>('/purchases', input);
  return data;
}
