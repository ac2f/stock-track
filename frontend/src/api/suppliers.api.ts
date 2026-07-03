import { api } from './client';

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  notes?: string;
  isActive: boolean;
}

export interface SupplierInput {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  notes?: string;
  isActive?: boolean;
}

export async function fetchSuppliers(search?: string): Promise<Supplier[]> {
  const { data } = await api.get<Supplier[]>('/suppliers', {
    params: search ? { search } : undefined,
  });
  return data;
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const { data } = await api.post<Supplier>('/suppliers', input);
  return data;
}

export async function updateSupplier(
  id: string,
  input: Partial<SupplierInput>,
): Promise<Supplier> {
  const { data } = await api.patch<Supplier>(`/suppliers/${id}`, input);
  return data;
}

export async function deleteSupplier(id: string): Promise<void> {
  await api.delete(`/suppliers/${id}`);
}
