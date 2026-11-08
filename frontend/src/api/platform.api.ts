import { api } from './client';
import type { BusinessLabel } from './registration.api';
import type { ShopFeatureKey, ShopFeatures } from '../types';

export type { BusinessLabel };

// ── İşletmeler ───────────────────────────────────────────────────────

export type BusinessStatus = 'pending' | 'active' | 'suspended';

export interface BusinessRow {
  id: string;
  name: string;
  status: BusinessStatus;
  isActive: boolean;
  plan: string;
  subscriptionUntil: string | null;
  daysLeft: number | null;
  province: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
  directoryVisible: boolean;
  createdAt: string;
  memberCount: number;
  machineCount: number;
  labels: string[];
  /** İş kolu etiketlerinin kimlikleri. */
  labelIds: string[];
  /** Sistem sahibinin bu işletmeye açtığı özellikler (Corel, rehber, ağ). */
  features: ShopFeatures;
  adminNote: string | null;
  admins: { fullName: string; email: string; phone: string | null }[];
}

export interface PlatformStats {
  total: number;
  pending: number;
  active: number;
  suspended: number;
  expiringSoon: number;
  expired: number;
  visibleInDirectory: number;
}

export interface BusinessQuery {
  status?: BusinessStatus;
  search?: string;
  province?: string;
  district?: string;
  expiring?: boolean;
  /** Yalnız bu iş kolu etiketini seçmiş işletmeler. */
  labelId?: string;
  /** Yalnız bu özelliği açık olan işletmeler. */
  feature?: ShopFeatureKey;
  page?: number;
  limit?: number;
}

export interface BusinessPage {
  items: BusinessRow[];
  meta: { total: number; page: number; limit: number; pageCount: number };
}

export interface BusinessAdminPatch {
  status?: BusinessStatus;
  plan?: string;
  subscriptionUntil?: string | null;
  extendDays?: number;
  adminNote?: string | null;
  isActive?: boolean;
  directoryVisible?: boolean;
  /** Yalnız gönderilen özellikler değişir. */
  features?: Partial<ShopFeatures>;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  return (await api.get<PlatformStats>('/platform/businesses/stats')).data;
}

export async function fetchBusinesses(q: BusinessQuery): Promise<BusinessPage> {
  return (await api.get<BusinessPage>('/platform/businesses', { params: q })).data;
}

export async function approveBusiness(id: string): Promise<BusinessRow> {
  return (await api.post<BusinessRow>(`/platform/businesses/${id}/approve`)).data;
}

export async function updateBusiness(id: string, patch: BusinessAdminPatch): Promise<BusinessRow> {
  return (await api.patch<BusinessRow>(`/platform/businesses/${id}`, patch)).data;
}

// ── Etiketler ────────────────────────────────────────────────────────

export async function fetchLabelsAdmin(): Promise<BusinessLabel[]> {
  return (await api.get<BusinessLabel[]>('/platform/labels')).data;
}

export async function createLabel(input: { name: string; description?: string }): Promise<BusinessLabel> {
  return (await api.post<BusinessLabel>('/platform/labels', input)).data;
}

export async function updateLabel(
  id: string,
  patch: { name?: string; description?: string; sortOrder?: number; isActive?: boolean },
): Promise<BusinessLabel> {
  return (await api.patch<BusinessLabel>(`/platform/labels/${id}`, patch)).data;
}

export async function deleteLabel(id: string): Promise<void> {
  await api.delete(`/platform/labels/${id}`);
}

// ── Makine türleri ───────────────────────────────────────────────────

export interface MachineTypeSize {
  id: string;
  widthMm: number;
  heightMm: number;
  label: string;
}

export interface MachineTypeNode {
  id: string;
  name: string;
  parentId: string | null;
  labelId: string | null;
  path: string;
  depth: number;
  description: string;
  sortOrder: number;
  isActive: boolean;
  sizes: MachineTypeSize[];
  machineCount?: number;
}

export async function fetchMachineTypesAdmin(): Promise<MachineTypeNode[]> {
  return (await api.get<MachineTypeNode[]>('/platform/machine-types')).data;
}

export async function createMachineType(input: {
  name: string;
  parentId?: string | null;
  labelId?: string | null;
  description?: string;
}): Promise<MachineTypeNode> {
  return (await api.post<MachineTypeNode>('/platform/machine-types', input)).data;
}

export async function updateMachineType(
  id: string,
  patch: { name?: string; parentId?: string | null; labelId?: string | null; description?: string; isActive?: boolean },
): Promise<MachineTypeNode> {
  return (await api.patch<MachineTypeNode>(`/platform/machine-types/${id}`, patch)).data;
}

export async function deleteMachineType(id: string): Promise<void> {
  await api.delete(`/platform/machine-types/${id}`);
}

export async function addMachineTypeSize(
  typeId: string,
  input: { widthMm: number; heightMm: number; label?: string },
): Promise<MachineTypeNode> {
  return (await api.post<MachineTypeNode>(`/platform/machine-types/${typeId}/sizes`, input)).data;
}

export async function deleteMachineTypeSize(sizeId: string): Promise<MachineTypeNode> {
  return (await api.delete<MachineTypeNode>(`/platform/machine-type-sizes/${sizeId}`)).data;
}

// ── Platform ayarları ────────────────────────────────────────────────

export interface PlatformSettings {
  registrationOpen: boolean;
  registrationAutoApprove: boolean;
  trialDays: number;
}

export async function fetchPlatformSettings(): Promise<PlatformSettings> {
  return (await api.get<PlatformSettings>('/platform/settings')).data;
}

export async function updatePlatformSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  return (await api.patch<PlatformSettings>('/platform/settings', patch)).data;
}

// ── Önbellek (yalnız sistem sahibi) ─────────────────────────────────

export interface CacheStatus {
  mode: 'redis' | 'memory' | 'off';
  ready: boolean;
  hits: number;
  misses: number;
  writes: number;
  invalidations: number;
  errors: number;
  hitRatio: number | null;
  flushPending: boolean;
  byGroup: Record<string, { hits: number; misses: number }>;
  redis: Record<string, string> | null;
}

export async function fetchCacheStatus(): Promise<CacheStatus> {
  return (await api.get<CacheStatus>('/system/cache')).data;
}

export async function flushCache(): Promise<{ removed: number }> {
  return (await api.post<{ removed: number }>('/system/cache/flush')).data;
}
