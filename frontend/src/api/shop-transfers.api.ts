import { api } from './client';
import type { MeasurementType, Paginated } from '../types';

/** Alan işletmedeki parçanın bugünkü durumu. */
export type TransferItemState =
  | 'pending'
  | 'untracked'
  | 'in_stock'
  | 'partial'
  | 'sold'
  | 'removed'
  | 'cancelled';

/** Malzemenin alan işletmedeki sonraki kullanımı (satış ya da işleme). */
export interface TransferUsage {
  kind: 'sale' | 'processing';
  at: string;
  /** Alıcı müşteri — alan işletmede satışları görme yetkisi yoksa null. */
  customerName: string | null;
  /** Müşteri başka bir işletmeyi temsil ediyorsa (zincir satış). */
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

export type TransferStatus = 'pending' | 'completed' | 'rejected' | 'cancelled';

export interface CancelRequest {
  byShopName: string;
  /** Geri alma talebini biz açtık. */
  byMe: boolean;
  at: string | null;
  note: string | null;
}

export interface ShopTransfer {
  id: string;
  transferNo: string;
  transferDate: string;
  status: TransferStatus;
  currency: string;
  totalAmount: number;
  note: string | null;
  fromShop: { id: string; name: string };
  toShop: { id: string; name: string };
  /** Seçili işletmeye göre: out = biz sattık, in = biz aldık. */
  direction: 'out' | 'in';
  createdBy: { id: string; fullName: string } | null;
  cancelledAt: string | null;
  saleId: string | null;
  purchaseOrderId: string | null;
  detailVisible: boolean;
  /** Belgeyi başlatan işletme (onaylayan karşı taraftır). */
  initiatorShopId: string;
  initiatedByMe: boolean;
  /** Karşı taraf onayı olmadan tamamlandı (kendi şubeleri / tanınan otomatik onay yetkisi). */
  autoApproved: boolean;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Karar bizi bekliyor ve onaylayıp reddedebiliriz. */
  canDecide: boolean;
  /** Bekleyen teklifimizi geri çekebiliriz. */
  canWithdraw: boolean;
  /** İki tarafı da yönettiğimiz için tamamlanmış belgeyi hemen geri alabiliriz. */
  canCancel: boolean;
  /** Karşı tarafın onayıyla geri almak için talep açabiliriz. */
  canRequestCancel: boolean;
  /** Açık geri alma talebi (karşı tarafın onayını bekler). */
  cancelRequest: CancelRequest | null;
  /** Alan işletmedeki sonraki durum görülebiliyor mu? Başka işletmenin stoğu izlenmez. */
  trackingVisible: boolean;
  summary: { items: number; inStock: number; partial: number; sold: number };
  items: ShopTransferItem[];
}

export interface TransferTarget {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  /** Kullanıcının kendi (başka) işletmesi: karşı onay gerekmez. */
  own: boolean;
  /** Kendi işletmesiyse: orada stok girişi yetkisi var mı? */
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

/** Alıcı olarak: satıcının paylaşılan stoğundan alım talebi. */
export interface RequestShopTransferInput {
  fromShopId: string;
  currency?: string;
  note?: string;
  items: ShopTransferItemInput[];
}

export type TransferStatusFilter = 'open' | 'pending' | 'completed' | 'rejected' | 'cancelled';

export interface ShopTransferFilters {
  direction?: 'out' | 'in';
  status?: TransferStatusFilter;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PendingTransferCount {
  /** Kararımızı bekleyen (onaylayıp reddedeceğimiz) işlem sayısı. */
  awaitingMe: number;
  /** Karşı tarafın kararını beklediklerimiz. */
  waitingOthers: number;
}

export async function fetchShopTransfers(
  filters: ShopTransferFilters,
): Promise<Paginated<ShopTransfer>> {
  const { data } = await api.get<Paginated<ShopTransfer>>('/shop-transfers', { params: filters });
  return data;
}

export async function fetchPendingTransferCount(): Promise<PendingTransferCount> {
  const { data } = await api.get<PendingTransferCount>('/shop-transfers/pending-count');
  return data;
}

/** Teklif/talep edilebilecek işletmeler: kendi şubelerim, rehberdekiler, ilişkide olduklarım. */
export async function fetchTransferTargets(q?: string): Promise<TransferTarget[]> {
  const { data } = await api.get<TransferTarget[]>('/shop-transfers/targets', {
    params: q?.trim() ? { q: q.trim() } : undefined,
  });
  return data;
}

/**
 * Satıcı olarak teklif: karşı işletme onaylayana kadar "onay bekliyor" kalır, stok/cari değişmez.
 * Kendi şubeniz ya da "otomatik onayla" yetkisi veren işletme ise hemen tamamlanır.
 */
export async function createShopTransfer(input: CreateShopTransferInput): Promise<ShopTransfer> {
  const { data } = await api.post<ShopTransfer>('/shop-transfers', input);
  return data;
}

/** Alıcı olarak: satıcının "bende var" listesinden alım talebi. */
export async function requestShopTransfer(input: RequestShopTransferInput): Promise<ShopTransfer> {
  const { data } = await api.post<ShopTransfer>('/shop-transfers/request', input);
  return data;
}

/** Karşı tarafın teklifini (ya da geri alma talebini) onaylar. */
export async function approveShopTransfer(id: string, note?: string): Promise<ShopTransfer> {
  const { data } = await api.post<ShopTransfer>(`/shop-transfers/${id}/approve`, { note: note?.trim() || undefined });
  return data;
}

export async function rejectShopTransfer(id: string, note?: string): Promise<ShopTransfer> {
  const { data } = await api.post<ShopTransfer>(`/shop-transfers/${id}/reject`, { note: note?.trim() || undefined });
  return data;
}

/**
 * Bekleyen teklifi geri çeker; tamamlanmış belgeyi geri alır (iki tarafı da yönetiyorsanız hemen,
 * değilse karşı tarafın onayıyla) ya da kendi açtığınız geri alma talebini çeker.
 */
export async function cancelShopTransfer(id: string, note?: string): Promise<ShopTransfer> {
  const { data } = await api.post<ShopTransfer>(`/shop-transfers/${id}/cancel`, { note: note?.trim() || undefined });
  return data;
}
