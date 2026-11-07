import { api } from './client';
import type { ShopStatus } from '../types';

export interface BusinessProfile {
  id: string;
  name: string;
  legalName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  province: string | null;
  district: string | null;
  addressLine: string | null;
  description: string | null;
  directoryVisible: boolean;
  shareDebtInfo: boolean;
  shareCustomerInfo: boolean;
  labelIds: string[];
  labels: { id: string; name: string }[];
  status: ShopStatus;
  plan: string;
  subscriptionUntil: string | null;
  missingForDirectory: string[];
}

export type BusinessProfilePatch = Partial<
  Pick<
    BusinessProfile,
    | 'name'
    | 'legalName'
    | 'contactPerson'
    | 'phone'
    | 'email'
    | 'website'
    | 'province'
    | 'district'
    | 'addressLine'
    | 'description'
    | 'directoryVisible'
    | 'shareDebtInfo'
    | 'shareCustomerInfo'
  >
> & { labelIds?: string[] };

export async function fetchBusinessProfile(): Promise<BusinessProfile> {
  return (await api.get<BusinessProfile>('/business-profile')).data;
}

export async function updateBusinessProfile(patch: BusinessProfilePatch): Promise<BusinessProfile> {
  return (await api.patch<BusinessProfile>('/business-profile', patch)).data;
}

// ── Makineler (işletmenin envanteri) ─────────────────────────────────

export interface MachineRecord {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  machineTypeId: string | null;
  sizeId: string | null;
  workWidthMm: number | null;
  workHeightMm: number | null;
  brand: string | null;
  model: string | null;
  quantity: number;
  isPublic: boolean;
  notes: string | null;
}

export type MachineInput = Partial<
  Omit<MachineRecord, 'id' | 'isActive'> & { isActive: boolean }
> & { name: string; code: string };

export async function fetchMachines(): Promise<MachineRecord[]> {
  return (await api.get<MachineRecord[]>('/machines')).data;
}

export async function createMachine(input: MachineInput): Promise<MachineRecord> {
  return (await api.post<MachineRecord>('/machines', input)).data;
}

export async function updateMachine(id: string, patch: Partial<MachineInput>): Promise<MachineRecord> {
  return (await api.patch<MachineRecord>(`/machines/${id}`, patch)).data;
}

export async function deleteMachine(id: string): Promise<void> {
  await api.delete(`/machines/${id}`);
}
