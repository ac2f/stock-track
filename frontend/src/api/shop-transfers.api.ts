import { api } from './client';
import type { MeasurementType, Paginated } from '../types';

/** Alan dükkândaki parçanın bugünkü durumu. */
export type TransferItemState = 'in_stock' | 'partial' | 'sold' | 'removed' | 'cancelled';

/** Malzemenin alan dükkândaki sonraki kullanımı (satış ya da işleme). */
export interface TransferUsage {
  kind: 'sale' | 'processing';
  at: string;
  /** Alıcı müşteri — alan dükkânda satışları görme yetkisi yoksa null. */
  customerName: string | null;
  /** Müşteri başka bir dükkânı temsil ediyorsa (zincir satış). */
  toShopName: string | null;
  quantity: number;
  widthMm: number | null;
  heightMm: number | null;
  amount: number | null;
  currency: string;
  status?: string;
}

export interface ShopTransferItem {
  id: string;
  sourcePlateId: string;
  targetPlateId: string | null;
  plateName: string;
  categoryName: string | null;
  measurementType: MeasurementType;
  quantity: number;
  widthMm: number | null;
  heightMm: number | null;
  unitPrice: number;
  lineTotal: number;
  state: TransferItemState;
  /** 0–1: tabakada kalan alan, diğerlerinde kalan miktar oranı. */
  remainingRatio: number;
  usages: TransferUsage[];
}

export interface ShopTransfer {
  id: string;
  transferNo: string;
  transferDate: string;
  status: 'completed' | 'cancelled';
  currency: string;
  totalAmount: number;
  note: string | null;
  fromShop: { id: string; name: string };
  toShop: { id: string; name: string };
  /** Seçili dükkâna göre: out = biz sattık, in = biz aldık. */
  direction: 'out' | 'in';
  createdBy: { id: string; fullName: string } | null;
  cancelledAt: string | null;
  saleId: string | null;
  purchaseOrderId: string | null;
  detailVisible: boolean;
  canCancel: boolean;
  summary: { items: number; inStock: number; partial: number; sold: number };
  items: ShopTransferItem[];
}

export interface TransferTarget {
  id: string;
  name: string;
  /** Kullanıcı o dükkânda stok girişi yapabiliyor mu? */
  canSell: boolean;
}

export interface ShopTransferItemInput {
  plateId: string;
  /** Tabakada parça adedi; şeritte metre; diğerlerinde adet/kg. */
  quantity: number;
  /** Tabakada m² başına, diğerlerinde ölçü birimi başına. */
  unitPrice: number;
  widthMm?: number;
  heightMm?: number;
}

export interface CreateShopTransferInput {
  toShopId: string;
  transferDate?: string;
  currency?: string;
  note?: string;
  items: ShopTransferItemInput[];
}

export interface ShopTransferFilters {
  direction?: 'out' | 'in';
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchShopTransfers(
  filters: ShopTransferFilters,
): Promise<Paginated<ShopTransfer>> {
  const { data } = await api.get<Paginated<ShopTransfer>>('/shop-transfers', { params: filters });
  return data;
}

export async function fetchTransferTargets(): Promise<TransferTarget[]> {
  const { data } = await api.get<TransferTarget[]>('/shop-transfers/targets');
  return data;
}

/**
 * Seçili dükkândan başka bir dükkâna malzeme satar: burada satış (stok düşer,
 * alan dükkânın carisi borçlanır), orada alış (malzeme stoğa girer) aynı anda.
 */
export async function createShopTransfer(input: CreateShopTransferInput): Promise<ShopTransfer> {
  const { data } = await api.post<ShopTransfer>('/shop-transfers', input);
  return data;
}

/** Hiçbir parçası kullanılmamış belgeyi geri alır. */
export async function cancelShopTransfer(id: string): Promise<ShopTransfer> {
  const { data } = await api.post<ShopTransfer>(`/shop-transfers/${id}/cancel`);
  return data;
}
