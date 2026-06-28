// Backend DTO'larının frontend aynası (tip güvenliği için).

export type UserRole = 'owner' | 'employee';

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

export interface MaterialCategory {
  id: string;
  name: string;
  code: string;
  defaultMeasurementType: MeasurementType;
  isActive: boolean;
}

export interface MaterialTemplate {
  id: string;
  name: string;
  categoryId: string;
  category?: MaterialCategory;
  measurementType: MeasurementType;
  defaultBrandId?: string;
  defaultBrand?: MaterialBrand;
  defaultColorId?: string;
  defaultColor?: MaterialColor;
  defaultSizeId?: string;
  defaultSize?: MaterialSize;
  defaultThicknessId?: string;
  defaultThickness?: MaterialThickness;
  defaultVariant?: string;
  defaultAttributes?: Record<string, unknown>;
  description?: string;
  isActive: boolean;
}

export interface MaterialBrand {
  id: string;
  name: string;
  categoryId: string;
  isActive: boolean;
}

export interface MaterialColor {
  id: string;
  name: string;
  code?: string;
  categoryId: string;
  isActive: boolean;
}

export interface MaterialSize {
  id: string;
  widthMm: number;
  heightMm: number;
  categoryId: string;
  isActive: boolean;
}

export interface MaterialThickness {
  id: string;
  valueMm: number;
  categoryId: string;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface Plate {
  id: string;
  name: string;
  sku?: string;
  brand?: string;
  brandId?: string;
  color?: string;
  colorCode?: string;
  colorId?: string;
  variant?: string;
  measurementType: MeasurementType;
  widthMm: number;
  heightMm: number;
  sizeId?: string;
  thicknessMm: number;
  thicknessId?: string;
  quantityInStock: number;
  reorderLevel?: number;
  templateId?: string;
  template?: { category: MaterialCategory; name: string };
}

export interface PriceComparison {
  plateId: string;
  cheapest: PriceRow | null;
  mostRecent: PriceRow | null;
  average: { amount: number; currency: string } | null;
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

export interface DashboardSummary {
  baseCurrency: string;
  totalReceivable: number;
  totalPayable: number;
  todayCollected: number;
  monthCollected: number;
  monthProcessingRevenue: number;
  monthSalesTurnover: number;
  monthSalesMargin: number;
  criticalStockCount: number;
}

export interface CustomerAging {
  customerId: string;
  customerName: string;
  current: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

// ── Teklif (Quote) ──
export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'converted';
export type QuoteLineKind = 'sale' | 'processing';
export type MeasurementType = 'area' | 'length' | 'piece' | 'weight';

export interface QuoteItemInput {
  lineKind: QuoteLineKind;
  plateId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  billingUnit?: MeasurementType;
  widthMm?: number;
  heightMm?: number;
  lengthMeters?: number;
  stockSource?: 'business' | 'consignment_tracked' | 'third_party_untracked';
}

export interface QuoteItem extends QuoteItemInput {
  id: string;
  lineTotal: number;
}

export interface Quote {
  id: string;
  quoteNo: string;
  buyerCustomerId: string;
  buyerCustomer?: Customer;
  status: QuoteStatus;
  currency: string;
  subtotal: number;
  total: number;
  validUntil?: string | null;
  createdAt: string;
  items: QuoteItem[];
}

// ── Üretim Kuyruğu ──
export type ProcessingStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ProcessingJob {
  id: string;
  plateId: string;
  plate?: { name: string };
  customerId?: string;
  customer?: { name: string };
  status: ProcessingStatus;
  billingUnit: MeasurementType;
  quantityValue: number;
  totalCost: number;
  currency: string;
  processedAt: string;
  machineId?: string | null;
}

export interface ProcessingQueueGroup {
  machineId: string | null;
  machineName: string;
  jobs: ProcessingJob[];
}

// ── Müşteri Portalı (public) ──
export interface PortalSummary {
  name: string;
  companyName?: string | null;
  currentBalance: number;
  currency: string;
}

export interface PortalLedgerEntry {
  date: string;
  type: 'debit' | 'credit';
  sourceType: string;
  amount: number;
  balanceAfter: number;
  description?: string | null;
}

export interface PortalDocuments {
  sales: { id: string; date: string; total: number; currency: string }[];
  processing: {
    id: string;
    date: string;
    item: string | null;
    total: number;
    currency: string;
    status: ProcessingStatus;
  }[];
}
