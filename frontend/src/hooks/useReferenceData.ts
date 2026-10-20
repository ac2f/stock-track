import { useQuery } from '@tanstack/react-query';
import { fetchMaterialCategories, fetchMaterialTemplates } from '../api/materials.api';
import { fetchSuppliers } from '../api/suppliers.api';
import { fetchWarehouses } from '../api/warehouses.api';
import { fetchStaff } from '../api/shops.api';
import { fetchBankAccounts } from '../api/bank-accounts.api';
import {
  fetchBusinessSettings,
  fetchCutPricing,
  fetchDisplaySettings,
  fetchPricingSettings,
} from '../api/settings.api';

/**
 * Seyrek değişen başvuru verileri (tür, şablon, tedarikçi, depo, personel,
 * banka hesabı, ayarlar): ekranlar arasında paylaşılır ve 5 dk taze sayılır —
 * her ekran açılışında yeniden istenmez. Değiştiren işlemler ilgili anahtarı
 * geçersiz kılar (ör. ['material-categories']), liste hemen tazelenir.
 */
export const REFERENCE_STALE_MS = 5 * 60_000;

/** `enabled: false` → yalnız gerektiğinde (ör. form açılınca) istenir. */
type Opts = { enabled?: boolean };

export function useMaterialCategories(opts: Opts = {}) {
  return useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function useMaterialTemplates(opts: Opts = {}) {
  return useQuery({
    queryKey: ['material-templates'],
    queryFn: () => fetchMaterialTemplates(),
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function useSuppliers(opts: Opts = {}) {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => fetchSuppliers(),
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function useWarehouses(opts: Opts = {}) {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: fetchWarehouses,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

/** Dükkânın personeli (ödemeyi teslim alan vb. seçimler). */
export function useStaff(opts: Opts = {}) {
  return useQuery({
    queryKey: ['staff'],
    queryFn: fetchStaff,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function useBankAccounts(opts: Opts = {}) {
  return useQuery({
    queryKey: ['bank-accounts'],
    queryFn: fetchBankAccounts,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function useBusinessSettings(opts: Opts = {}) {
  return useQuery({
    queryKey: ['settings', 'business'],
    queryFn: fetchBusinessSettings,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function usePricingSettings(opts: Opts = {}) {
  return useQuery({
    queryKey: ['settings', 'pricing'],
    queryFn: fetchPricingSettings,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function useDisplaySettings(opts: Opts = {}) {
  return useQuery({
    queryKey: ['settings', 'display'],
    queryFn: fetchDisplaySettings,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}

export function useCutPricing(opts: Opts = {}) {
  return useQuery({
    queryKey: ['settings', 'cut-pricing'],
    queryFn: fetchCutPricing,
    staleTime: REFERENCE_STALE_MS,
    ...opts,
  });
}
