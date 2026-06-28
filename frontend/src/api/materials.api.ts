import { api } from './client';
import type {
  MaterialCategory,
  MaterialTemplate,
  Paginated,
  Plate,
  PriceComparison,
} from '../types';

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

export interface MaterialTemplateFilters {
  categoryId?: string;
  search?: string;
}

/** Ürün türleri (şablonlar) — stok kalemi eklerken seçilir. */
export async function fetchMaterialTemplates(
  filters?: MaterialTemplateFilters,
): Promise<MaterialTemplate[]> {
  const { data } = await api.get<MaterialTemplate[]>('/material-templates', {
    params: filters,
  });
  return data;
}

export interface MaterialTemplateInput {
  name: string;
  categoryId: string;
  measurementType?: MaterialTemplate['measurementType'];
  defaultBrand?: string;
  defaultColor?: string;
  defaultColorCode?: string;
  defaultVariant?: string;
  defaultThicknessMm?: number;
  defaultWidthMm?: number;
  defaultHeightMm?: number;
  defaultAttributes?: Record<string, unknown>;
  description?: string;
  isActive?: boolean;
}

export async function createMaterialTemplate(
  input: MaterialTemplateInput,
): Promise<MaterialTemplate> {
  const { data } = await api.post<MaterialTemplate>('/material-templates', input);
  return data;
}

export async function updateMaterialTemplate(
  id: string,
  input: Partial<MaterialTemplateInput>,
): Promise<MaterialTemplate> {
  const { data } = await api.patch<MaterialTemplate>(
    `/material-templates/${id}`,
    input,
  );
  return data;
}

export async function deleteMaterialTemplate(id: string): Promise<void> {
  await api.delete(`/material-templates/${id}`);
}

export interface CreatePlateInput {
  templateId: string;
  measurementType?: Plate['measurementType'];
  name?: string;
  sku?: string;
  brand?: string;
  color?: string;
  colorCode?: string;
  variant?: string;
  widthMm?: number;
  heightMm?: number;
  thicknessMm?: number;
  attributes?: Record<string, unknown>;
  quantityInStock?: number;
  warehouseId?: string;
  reorderLevel?: number;
}

export async function createPlate(input: CreatePlateInput): Promise<Plate> {
  const { data } = await api.post<Plate>('/plates', input);
  return data;
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
