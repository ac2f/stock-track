import { api } from './client';
import type { MaterialCategory, Paginated, Plate, PriceComparison } from '../types';

export interface PlateFilters {
  search?: string;
  category?: MaterialCategory;
  brand?: string;
  color?: string;
  inStock?: boolean;
  page?: number;
  limit?: number;
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
