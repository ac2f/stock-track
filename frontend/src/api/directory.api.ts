import { api } from './client';
import type { MachineTypeNode } from './platform.api';

export interface DirectoryMachine {
  id: string;
  name: string;
  typeId: string | null;
  typeName: string | null;
  typePath: string | null;
  widthMm: number | null;
  heightMm: number | null;
  brand: string | null;
  model: string | null;
  quantity: number;
  matches: boolean;
}

export interface DirectoryShop {
  id: string;
  name: string;
  legalName: string | null;
  description: string | null;
  province: string | null;
  district: string | null;
  addressLine: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  memberSince: string;
  labels: { id: string; name: string }[];
  machines: DirectoryMachine[];
}

export interface DirectoryMachineHit extends DirectoryMachine {
  shop: {
    id: string;
    name: string;
    province: string | null;
    district: string | null;
    phone: string | null;
    email: string | null;
  };
}

export interface DirectoryQuery {
  q?: string;
  province?: string;
  district?: string;
  labelIds?: string[];
  machineTypeId?: string;
  minWidthMm?: number;
  minHeightMm?: number;
  page?: number;
  limit?: number;
}

export interface Paged<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; pageCount: number };
}

export interface DirectoryFacets {
  provinces: { name: string; count: number }[];
  districts: { name: string; count: number }[];
  labels: { id: string; name: string; count: number }[];
  machineTypes: { id: string; name: string; path: string; count: number }[];
}

const params = (q: DirectoryQuery) => ({
  ...q,
  labelIds: q.labelIds?.length ? q.labelIds.join(',') : undefined,
});

export async function fetchDirectoryShops(q: DirectoryQuery): Promise<Paged<DirectoryShop>> {
  return (await api.get<Paged<DirectoryShop>>('/directory/shops', { params: params(q) })).data;
}

export async function fetchDirectoryMachines(q: DirectoryQuery): Promise<Paged<DirectoryMachineHit>> {
  return (await api.get<Paged<DirectoryMachineHit>>('/directory/machines', { params: params(q) })).data;
}

export async function fetchDirectoryFacets(province?: string): Promise<DirectoryFacets> {
  return (await api.get<DirectoryFacets>('/directory/facets', { params: { province } })).data;
}

/** Makine türü ağacı (ebatlarıyla), etkin olanlar. */
export async function fetchMachineTypeTree(): Promise<MachineTypeNode[]> {
  return (await api.get<MachineTypeNode[]>('/directory/machine-types')).data;
}
