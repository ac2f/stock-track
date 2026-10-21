import { api } from './client';
import type { Paginated } from '../types';

export interface SaleItemRow {
  plateId?: string | null;
  // Serbest (stoksuz) kalemde malzeme adı ve fiyatlama birimi.
  itemName?: string | null;
  billingUnit?: 'area' | 'length' | 'piece' | 'weight' | null;
  plate?: {
    name: string;
    // Şerit/rulo satışında miktarın "m" olarak gösterilmesi için.
    measurementType?: 'area' | 'length' | 'piece' | 'weight';
  } | null;
  quantity: number;
  widthMm?: number | null;
  heightMm?: number | null;
  unitPrice: number;
  lineTotal: number;
  /** Malzeme başka dükkândan alındıysa (dükkânlar arası satış). */
  origin?: { transferNo: string; fromShopName: string } | null;
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
  /** Satış başka bir dükkâna yapıldıysa (dükkânlar arası satış belgesi). */
  shopTransfer?: { id: string; transferNo: string; toShopName: string } | null;
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

export interface SalesSummary {
  count: number;
  saleTotal: number;
  businessMargin: number;
}

/** Aralıktaki satışların özeti (adet, ciro, kâr) — sunucuda toplanır, sayfaya bağlı değil. */
export async function fetchSalesSummary(
  filters: Pick<SaleFilters, 'from' | 'to' | 'buyerCustomerId'>,
): Promise<SalesSummary> {
  const { data } = await api.get<SalesSummary>('/sales/summary', { params: filters });
  return data;
}
