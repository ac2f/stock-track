import { api } from './client';

export interface Province {
  plate: string;
  name: string;
  region: string;
}

export async function fetchProvinces(): Promise<Province[]> {
  const { data } = await api.get<Province[]>('/geo/provinces');
  return data;
}

/** `key`: plaka kodu ("34") ya da il adı. */
export async function fetchDistricts(key: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/geo/provinces/${encodeURIComponent(key)}/districts`);
  return data;
}
