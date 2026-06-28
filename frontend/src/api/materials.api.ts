import { api } from './client';
import type {
  MaterialBrand,
  MaterialCategory,
  MaterialColor,
  MaterialSize,
  MaterialTemplate,
  MaterialThickness,
  Paginated,
  Plate,
  PlateStockLevel,
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

/** Kategori bazlı katalog: markalar. */
export async function fetchMaterialBrands(
  categoryId?: string,
): Promise<MaterialBrand[]> {
  const { data } = await api.get<MaterialBrand[]>('/material-brands', {
    params: categoryId ? { categoryId } : undefined,
  });
  return data;
}

export interface MaterialBrandInput {
  name: string;
  categoryId: string;
  isActive?: boolean;
}

export async function createMaterialBrand(
  input: MaterialBrandInput,
): Promise<MaterialBrand> {
  const { data } = await api.post<MaterialBrand>('/material-brands', input);
  return data;
}

export async function updateMaterialBrand(
  id: string,
  input: Partial<MaterialBrandInput>,
): Promise<MaterialBrand> {
  const { data } = await api.patch<MaterialBrand>(`/material-brands/${id}`, input);
  return data;
}

export async function deleteMaterialBrand(id: string): Promise<void> {
  await api.delete(`/material-brands/${id}`);
}

/** Kategori bazlı katalog: renkler (renk kodu birlikte tutulur). */
export async function fetchMaterialColors(
  categoryId?: string,
): Promise<MaterialColor[]> {
  const { data } = await api.get<MaterialColor[]>('/material-colors', {
    params: categoryId ? { categoryId } : undefined,
  });
  return data;
}

export interface MaterialColorInput {
  name: string;
  code?: string;
  categoryId: string;
  isActive?: boolean;
}

export async function createMaterialColor(
  input: MaterialColorInput,
): Promise<MaterialColor> {
  const { data } = await api.post<MaterialColor>('/material-colors', input);
  return data;
}

export async function updateMaterialColor(
  id: string,
  input: Partial<MaterialColorInput>,
): Promise<MaterialColor> {
  const { data } = await api.patch<MaterialColor>(`/material-colors/${id}`, input);
  return data;
}

export async function deleteMaterialColor(id: string): Promise<void> {
  await api.delete(`/material-colors/${id}`);
}

/** Kategori bazlı katalog: ebatlar. */
export async function fetchMaterialSizes(
  categoryId?: string,
): Promise<MaterialSize[]> {
  const { data } = await api.get<MaterialSize[]>('/material-sizes', {
    params: categoryId ? { categoryId } : undefined,
  });
  return data;
}

export interface MaterialSizeInput {
  widthMm: number;
  heightMm: number;
  categoryId: string;
  isActive?: boolean;
}

export async function createMaterialSize(
  input: MaterialSizeInput,
): Promise<MaterialSize> {
  const { data } = await api.post<MaterialSize>('/material-sizes', input);
  return data;
}

export async function updateMaterialSize(
  id: string,
  input: Partial<MaterialSizeInput>,
): Promise<MaterialSize> {
  const { data } = await api.patch<MaterialSize>(`/material-sizes/${id}`, input);
  return data;
}

export async function deleteMaterialSize(id: string): Promise<void> {
  await api.delete(`/material-sizes/${id}`);
}

/** Kategori bazlı katalog: kalınlıklar. */
export async function fetchMaterialThicknesses(
  categoryId?: string,
): Promise<MaterialThickness[]> {
  const { data } = await api.get<MaterialThickness[]>('/material-thicknesses', {
    params: categoryId ? { categoryId } : undefined,
  });
  return data;
}

export interface MaterialThicknessInput {
  valueMm: number;
  categoryId: string;
  isActive?: boolean;
}

export async function createMaterialThickness(
  input: MaterialThicknessInput,
): Promise<MaterialThickness> {
  const { data } = await api.post<MaterialThickness>('/material-thicknesses', input);
  return data;
}

export async function updateMaterialThickness(
  id: string,
  input: Partial<MaterialThicknessInput>,
): Promise<MaterialThickness> {
  const { data } = await api.patch<MaterialThickness>(
    `/material-thicknesses/${id}`,
    input,
  );
  return data;
}

export async function deleteMaterialThickness(id: string): Promise<void> {
  await api.delete(`/material-thicknesses/${id}`);
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
  defaultBrandId?: string;
  defaultColorId?: string;
  defaultSizeId?: string;
  defaultThicknessId?: string;
  defaultVariant?: string;
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
  variant?: string;
  // Bu fiziksel parçanın kalan (kesilmiş) ebadı; verilmezse standart tabaka ebadı.
  widthMm?: number;
  heightMm?: number;
  // Konsinye sahibi (müşteri); boşsa stok işletmeye aittir.
  ownerCustomerId?: string;
  addedAt?: string; // edinme tarihi (YYYY-MM-DD); boşsa bugün
  processedAt?: string; // işlenme tarihi (YYYY-MM-DD)
  attributes?: Record<string, unknown>;
  quantityInStock?: number;
  warehouseId?: string;
}

export async function createPlate(input: CreatePlateInput): Promise<Plate> {
  const { data } = await api.post<Plate>('/plates', input);
  return data;
}

/** Plaka düzenleme (kalan ebat, tarihler, ad, stok kodu, varyant). */
export type UpdatePlateInput = Partial<
  Pick<
    CreatePlateInput,
    | 'name'
    | 'sku'
    | 'variant'
    | 'widthMm'
    | 'heightMm'
    | 'addedAt'
    | 'processedAt'
  >
>;

export async function updatePlate(
  id: string,
  input: UpdatePlateInput,
): Promise<Plate> {
  const { data } = await api.patch<Plate>(`/plates/${id}`, input);
  return data;
}

/** Bir plakanın depo/sahip bazlı stok seviyeleri (konsinye dahil). */
export async function fetchPlateStockLevels(
  plateId: string,
): Promise<PlateStockLevel[]> {
  const { data } = await api.get<PlateStockLevel[]>(
    `/plates/${plateId}/stock-levels`,
  );
  return data;
}

export interface TransferOwnershipInput {
  ownerCustomerId: string;
  warehouseId?: string;
  quantity?: number;
}

/** Konsinye stoğun sahipliğini işletmeye aktarır. */
export async function transferPlateToBusiness(
  plateId: string,
  input: TransferOwnershipInput,
): Promise<unknown> {
  const { data } = await api.post(
    `/plates/${plateId}/transfer-to-business`,
    input,
  );
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
