import { api, tokenStore } from './client';

export interface BusinessLabel {
  id: string;
  name: string;
  description: string;
  sortOrder?: number;
  isActive?: boolean;
  shopCount?: number;
}

export interface RegistrationOptions {
  open: boolean;
  autoApprove: boolean;
  trialDays: number;
  labels: BusinessLabel[];
}

export interface RegisterInput {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  province: string;
  district: string;
  addressLine?: string;
  description?: string;
  website?: string;
  labelIds: string[];
  acceptTerms: boolean;
}

export interface RegistrationResult {
  status: 'pending' | 'active';
  message: string;
  shop: { id: string; name: string };
  auth?: { accessToken: string; refreshToken: string };
}

export async function fetchRegistrationOptions(): Promise<RegistrationOptions> {
  const { data } = await api.get<RegistrationOptions>('/registration/options');
  return data;
}

/** Kaydı yapar; hemen etkinleşirse oturum anahtarlarını saklar. */
export async function registerBusiness(input: RegisterInput): Promise<RegistrationResult> {
  const { data } = await api.post<RegistrationResult>('/registration', input);
  if (data.auth) tokenStore.set(data.auth.accessToken, data.auth.refreshToken);
  return data;
}
