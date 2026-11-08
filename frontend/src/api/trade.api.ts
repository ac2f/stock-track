import { api } from './client';
import type { MeasurementType, Paginated } from '../types';

// ── İşletmeler arası yetkiler ────────────────────────────────────────

/**
 * auto_approve: o işletmenin bana yönelttiği teklif/talepler onayım beklenmeden tamamlanır.
 * view_stock: paylaşım kurallarımdaki "yalnız yetki verdiklerim" listeleri o işletmeye görünür.
 * block: o işletme beni göremez, bana işlem yönlendiremez, stoğumu göremez.
 */
export type PartnerPermission = 'auto_approve' | 'view_stock' | 'block';

export interface PartnerGrant {
  id: string;
  permission: PartnerPermission;
  /** Verilen yetkide yetkiyi alan, alınan yetkide yetkiyi veren işletme. */
  shop: { id: string; name: string; province: string | null; district: string | null };
  /** Boşsa süresiz. */
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface PartnerGrants {
  given: PartnerGrant[];
  received: PartnerGrant[];
}

export interface UpsertPartnerGrantInput {
  granteeShopId: string;
  permission: PartnerPermission;
  /** ISO zaman; boş/null = süresiz. */
  expiresAt?: string | null;
  note?: string | null;
}

export async function fetchPartnerGrants(): Promise<PartnerGrants> {
  const { data } = await api.get<PartnerGrants>('/partners/grants');
  return data;
}

export async function upsertPartnerGrant(input: UpsertPartnerGrantInput): Promise<PartnerGrant> {
  const { data } = await api.put<PartnerGrant>('/partners/grants', input);
  return data;
}

export async function deletePartnerGrant(id: string): Promise<void> {
  await api.delete(`/partners/grants/${id}`);
}

// ── "Bende var, satıyorum": stok paylaşım kuralları ───────────────────

export type StockShareKind = 'plate' | 'template' | 'category';
export type StockShareVisibility = 'public' | 'partners';

export interface StockShare {
  id: string;
  kind: StockShareKind;
  refId: string;
  label: string;
  visibility: StockShareVisibility;
  isActive: boolean;
  note: string | null;
  /** Şu an listelenen (stoklu, etkin) kalem sayısı. */
  itemCount: number;
}

export interface UpsertStockShareInput {
  kind: StockShareKind;
  refId: string;
  visibility?: StockShareVisibility;
  isActive?: boolean;
  note?: string | null;
}

export async function fetchStockShares(): Promise<StockShare[]> {
  const { data } = await api.get<StockShare[]>('/stock-shares');
  return data;
}

export async function upsertStockShare(input: UpsertStockShareInput): Promise<StockShare> {
  const { data } = await api.put<StockShare>('/stock-shares', input);
  return data;
}

export async function updateStockShare(
  id: string,
  patch: { visibility?: StockShareVisibility; isActive?: boolean; note?: string | null },
): Promise<StockShare> {
  const { data } = await api.patch<StockShare>(`/stock-shares/${id}`, patch);
  return data;
}

export async function deleteStockShare(id: string): Promise<void> {
  await api.delete(`/stock-shares/${id}`);
}

/** Tüm paylaşım kurallarını tek tuşla aç/kapat. */
export async function setAllStockShares(isActive: boolean): Promise<{ changed: number }> {
  const { data } = await api.post<{ changed: number }>('/stock-shares/set-all', { isActive });
  return data;
}

// ── Pazar yeri: diğer işletmelerin bana listelediği stok ──────────────

export interface MarketListing {
  plateId: string;
  shop: { id: string; name: string; province: string | null; district: string | null };
  name: string;
  categoryName: string | null;
  templateName: string | null;
  brand: string | null;
  color: string | null;
  thicknessMm: number | null;
  measurementType: MeasurementType;
  unitOfMeasure: string;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  retailPrice: number | null;
  retailCurrency: string;
}

export interface MarketplaceFilters {
  search?: string;
  category?: string;
  shopId?: string;
  page?: number;
  limit?: number;
}

export async function fetchMarketplace(filters: MarketplaceFilters): Promise<Paginated<MarketListing>> {
  const { data } = await api.get<Paginated<MarketListing>>('/marketplace/listings', { params: filters });
  return data;
}
