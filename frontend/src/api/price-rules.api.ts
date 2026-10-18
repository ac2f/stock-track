import { api } from './client';
import type { SupplierPriceUnit } from './materials.api';

/**
 * Fiyat çatıları: bir grup malzemenin (tüm pleksiler, 2.8 mm pleksiler,
 * Akpolimer beyaz pleksi ...) malzemeci fiyatları ve referans fiyatı.
 * Teklifte stok kaleminin satış fiyatı bundan önerilir.
 */

export interface PriceRuleEntry {
  id: string;
  supplierId: string | null;
  /** Boşsa işletmenin kendi liste fiyatı. */
  supplierName: string | null;
  price: number;
  currency: string;
  /** Son kurla baz para birimi karşılığı; kur yoksa null. */
  priceBase: number | null;
  priceUpdatedAt: string;
  note: string | null;
}

export interface PriceRuleReference {
  entryId: string;
  supplierId: string | null;
  supplierName: string | null;
  price: number;
  currency: string;
  priceBase: number | null;
  /** Referans seçilmemiş, en ucuzu alındı. */
  autoPicked: boolean;
  priceUpdatedAt: string;
}

export interface PriceRuleCoverage {
  /** Kapsama giren (stokta) kalem sayısı. */
  matched: number;
  /** Bu çatının geçerli olduğu kalemler. */
  effective: number;
  /** Geçerli olduğu kalemlerden kendi fiyatı olanlar. */
  ownPrice: number;
}

export interface PriceRule {
  id: string;
  label: string;
  categoryId: string;
  category: { id: string; name: string } | null;
  brandId: string | null;
  brand: { id: string; name: string } | null;
  thicknessId: string | null;
  thickness: { id: string; valueMm: number } | null;
  colorId: string | null;
  color: { id: string; name: string; code?: string | null } | null;
  sizeId: string | null;
  size: { id: string; widthMm: number; heightMm: number } | null;
  variant: string | null;
  unit: SupplierPriceUnit;
  markupPercent: number | null;
  referenceEntryId: string | null;
  note: string | null;
  isActive: boolean;
  updatedAt: string;
  entries: PriceRuleEntry[];
  reference: PriceRuleReference | null;
  coverage: PriceRuleCoverage;
}

export interface PriceRuleScope {
  categoryId: string;
  brandId?: string | null;
  thicknessId?: string | null;
  colorId?: string | null;
  sizeId?: string | null;
  variant?: string | null;
}

export interface PriceRuleInput extends PriceRuleScope {
  unit?: SupplierPriceUnit;
  markupPercent?: number | null;
  note?: string | null;
  isActive?: boolean;
}

export interface PriceRulePreview {
  label: string;
  matched: number;
  effective: number;
  samples: string[];
  duplicate: { id: string; label: string } | null;
}

export async function fetchPriceRules(categoryId?: string): Promise<PriceRule[]> {
  const { data } = await api.get<PriceRule[]>('/price-rules', {
    params: categoryId ? { categoryId } : undefined,
  });
  return data;
}

export async function previewPriceRule(
  scope: PriceRuleScope & { excludeId?: string },
): Promise<PriceRulePreview> {
  const params = Object.fromEntries(
    Object.entries(scope).filter(([, v]) => v != null && v !== ''),
  );
  const { data } = await api.get<PriceRulePreview>('/price-rules/preview', { params });
  return data;
}

export async function createPriceRule(input: PriceRuleInput): Promise<PriceRule> {
  const { data } = await api.post<PriceRule>('/price-rules', input);
  return data;
}

export async function updatePriceRule(
  id: string,
  input: Partial<PriceRuleInput>,
): Promise<PriceRule> {
  const { data } = await api.patch<PriceRule>(`/price-rules/${id}`, input);
  return data;
}

export async function deletePriceRule(id: string): Promise<void> {
  await api.delete(`/price-rules/${id}`);
}

export interface PriceRuleEntryInput {
  /** Boş: işletmenin kendi liste fiyatı. */
  supplierId?: string | null;
  price: number;
  currency?: string;
  note?: string | null;
  makeReference?: boolean;
}

export async function upsertPriceRuleEntry(
  ruleId: string,
  input: PriceRuleEntryInput,
): Promise<PriceRule> {
  const { data } = await api.put<PriceRule>(`/price-rules/${ruleId}/entries`, input);
  return data;
}

export async function deletePriceRuleEntry(ruleId: string, entryId: string): Promise<PriceRule> {
  const { data } = await api.delete<PriceRule>(`/price-rules/${ruleId}/entries/${entryId}`);
  return data;
}

/** Referans malzemeciyi seçer; null en ucuza döndürür. */
export async function setPriceRuleReference(
  ruleId: string,
  entryId: string | null,
): Promise<PriceRule> {
  const { data } = await api.put<PriceRule>(`/price-rules/${ruleId}/reference`, { entryId });
  return data;
}

/** Çatı fiyatının birimi, kısa okunur ad. */
export const RULE_UNIT_LABEL: Record<SupplierPriceUnit, string> = {
  per_plate: 'tabaka',
  per_m2: 'm²',
  per_meter: 'metre',
  per_kg: 'kg',
};
