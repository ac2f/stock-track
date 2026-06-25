// Backend DTO'larının frontend aynası (tip güvenliği için).

export type UserRole = 'owner' | 'employee';

export type MaterialCategory =
  | 'aluminum'
  | 'aluminum_composite'
  | 'plexiglass'
  | 'dekota'
  | 'mdf'
  | 'forex'
  | 'other';

export type PaymentMethod = 'cash' | 'bank_transfer';
export type PriceUnit = 'per_plate' | 'per_m2' | 'per_kg';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; pageCount: number };
}

export interface Plate {
  id: string;
  name: string;
  brand?: string;
  color?: string;
  colorCode?: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  quantityInStock: number;
  template?: { category: MaterialCategory; name: string };
}

export interface PriceComparison {
  plateId: string;
  cheapest: PriceRow | null;
  mostRecent: PriceRow | null;
  prices: PriceRow[];
}

export interface PriceRow {
  supplierId: string;
  supplier: string;
  price: number;
  currency: string;
  unit: PriceUnit;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  phone?: string;
  currentBalance: number;
}
