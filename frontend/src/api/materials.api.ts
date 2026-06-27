import { api } from './client';
import type { MaterialCategory, Paginated, Plate, PriceComparison } from '../types';

export interface PlateFilters {
  search?: string;
  categoryId?: string;
  brand?: string;
  color?: string;
  inStock?: boolean;
  page?: number;
  limit?: number;
}

/** Malzeme türleri (kategoriler) — dropdown + yönetim ekranı için. */
export async function fetchMaterialCategories(): Promise<MaterialCategory[]> {
  const { data } = await api.get<MaterialCategory[]>('/material-categories');
  return data;
}

export interface MaterialCategoryInput {
  name: string;
  code: string;
  defaultMeasurementType?: MaterialCategory['defaultMeasurementType'];
  isActive?: boolean;
}

export async function createMaterialCategory(
  input: MaterialCategoryInput,
): Promise<MaterialCategory> {
  const { data } = await api.post<MaterialCategory>('/material-categories', input);
  return data;
}

export async function updateMaterialCategory(
  id: string,
  input: Partial<MaterialCategoryInput>,
): Promise<MaterialCategory> {
  const { data } = await api.patch<MaterialCategory>(
    `/material-categories/${id}`,
    input,
  );
  return data;
}

export async function deleteMaterialCategory(id: string): Promise<void> {
  await api.delete(`/material-categories/${id}`);
}

/** Gelişmiş filtreleme ile plaka listesi. */
export async function fetchPlates(
  filters: PlateFilters,
): Promise<Paginated<Plate>> {
  const { data } = await api.get<Paginated<Plate>>('/plates', {
    params: filters,
  });
  return data;
}

/** Tedarikçi fiyat karşılaştırması (en ucuz + en güncel). */
export async function comparePrices(
  plateId: string,
  unit = 'per_plate',
): Promise<PriceComparison> {
  const { data } = await api.get<PriceComparison>(
    `/plates/${plateId}/prices/compare`,
    { params: { unit } },
  );
  return data;
}
