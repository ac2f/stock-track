import { api } from './client';
import type { MeasurementType } from '../types';

/**
 * Hizmet kataloğu: gruplar → hizmet türleri → fiyat kademeleri (ölçüye göre) ve kombinasyon
 * indirimleri. Teklifte "Hizmet" kalemi buradan fiyatlanır; onaylanınca iş kuyruğa düşer.
 */

export interface ServiceTier {
  id: string;
  typeId: string;
  name: string;
  minMeasure: number | null;
  maxMeasure: number | null;
  /** Boşsa hizmet türünün birimi. */
  unit: MeasurementType | null;
  price: number;
  currency: string;
  sortOrder: number;
}

export interface ServiceType {
  id: string;
  groupId: string;
  name: string;
  unit: MeasurementType;
  /** Kademeyi seçtiren ölçünün adı ("Harf boyu (cm)"); boşsa ölçü sorulmaz. */
  measureLabel: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
  tiers: ServiceTier[];
}

export interface ServiceGroup {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  types: ServiceType[];
}

export interface ServiceBundle {
  id: string;
  name: string;
  serviceTypeIds: string[];
  discountKind: 'percent' | 'fixed';
  discountValue: number;
  isActive: boolean;
}

export interface ServiceCatalog {
  groups: ServiceGroup[];
  bundles: ServiceBundle[];
}

export interface ServiceTierInput {
  id?: string;
  name: string;
  minMeasure?: number | null;
  maxMeasure?: number | null;
  unit?: MeasurementType | null;
  price: number;
  currency?: string;
}

export interface ServiceTypeInput {
  groupId: string;
  name: string;
  unit: MeasurementType;
  measureLabel?: string | null;
  note?: string | null;
  isActive?: boolean;
  tiers: ServiceTierInput[];
}

export interface ServiceBundleInput {
  name: string;
  serviceTypeIds: string[];
  discountKind: 'percent' | 'fixed';
  discountValue: number;
  isActive?: boolean;
}

export async function fetchServiceCatalog(activeOnly = false): Promise<ServiceCatalog> {
  const { data } = await api.get<ServiceCatalog>('/service-catalog', { params: activeOnly ? { active: 'true' } : undefined });
  return data;
}

export async function createServiceGroup(input: { name: string; isActive?: boolean }): Promise<ServiceGroup> {
  const { data } = await api.post<ServiceGroup>('/service-catalog/groups', input);
  return data;
}
export async function updateServiceGroup(id: string, input: { name?: string; isActive?: boolean; sortOrder?: number }): Promise<ServiceGroup> {
  const { data } = await api.patch<ServiceGroup>(`/service-catalog/groups/${id}`, input);
  return data;
}
export async function deleteServiceGroup(id: string): Promise<void> {
  await api.delete(`/service-catalog/groups/${id}`);
}

export async function createServiceType(input: ServiceTypeInput): Promise<ServiceType> {
  const { data } = await api.post<ServiceType>('/service-catalog/types', input);
  return data;
}
export async function updateServiceType(id: string, input: Partial<ServiceTypeInput>): Promise<ServiceType> {
  const { data } = await api.patch<ServiceType>(`/service-catalog/types/${id}`, input);
  return data;
}
export async function deleteServiceType(id: string): Promise<void> {
  await api.delete(`/service-catalog/types/${id}`);
}

export async function createServiceBundle(input: ServiceBundleInput): Promise<ServiceBundle> {
  const { data } = await api.post<ServiceBundle>('/service-catalog/bundles', input);
  return data;
}
export async function updateServiceBundle(id: string, input: Partial<ServiceBundleInput>): Promise<ServiceBundle> {
  const { data } = await api.patch<ServiceBundle>(`/service-catalog/bundles/${id}`, input);
  return data;
}
export async function deleteServiceBundle(id: string): Promise<void> {
  await api.delete(`/service-catalog/bundles/${id}`);
}
