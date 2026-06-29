import { api } from './client';

/** İşletme/proje kimliği — belgelerde ve arayüz başlığında kullanılır. */
export interface BusinessSettings {
  name: string;
  address: string;
  phone: string;
  taxNo: string;
  logoPath: string;
  portalBaseUrl: string;
  defaultCurrency: string;
}

export interface UpdateBusinessInput {
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessTaxNo?: string;
  businessLogoPath?: string;
  portalBaseUrl?: string;
}

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  const { data } = await api.get<BusinessSettings>('/settings/business');
  return data;
}

export async function updateBusinessSettings(
  input: UpdateBusinessInput,
): Promise<unknown> {
  const { data } = await api.put('/settings/business', input);
  return data;
}
