// Backend DTO'larının frontend aynası (tip güvenliği için).

export type UserRole = 'owner' | 'employee';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card';
export type PaymentDirection = 'incoming' | 'outgoing';

export interface Employee {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountName?: string;
  iban: string;
  currency?: string;
  isActive?: boolean;
}

export interface Payment {
  id: string;
  customerId: string;
  direction: PaymentDirection;
  amount: number;
  currency: string;
  paymentDate: string;
  method: PaymentMethod;
  receivedBy?: { id: string; fullName: string };
  bankAccount?: { id: string; bankName: string };
  cardBusinessName?: string;
  referenceNo?: string;
  note?: string;
  balanceAfter: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  isRecurring: boolean;
  recurringAmount?: number | null;
  recurringDayOfMonth?: number | null;
  isActive: boolean;
}

export interface PendingExpense {
  categoryId: string;
  name: string;
  amount: number;
  dueDate: string;
  overdue: boolean;
}

export interface CustomerLedgerEntry {
  id: string;
  entryType: 'debit' | 'credit';
  sourceType: string;
  amount: number;
  balanceAfter: number;
  occurredAt: string;
  description?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Expense {
  id: string;
  categoryId: string;
  category?: ExpenseCategory;
  projectId?: string | null;
  project?: Project | null;
  amount: number;
  currency: string;
  expenseDate: string;
  description?: string;
}

export interface ExpenseSummary {
  total: number;
  byCategory: { name: string; total: number }[];
  byProject: { name: string; total: number }[];
}
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
  addedAt?: string; // edinme/stoğa giriş tarihi (YYYY-MM-DD)
  processedAt?: string; // işlenme tarihi (YYYY-MM-DD)
  owners?: string[]; // dinamik sahip(ler): "İşletme" ve/veya müşteri adları
  templateId?: string;
  template?: { category: MaterialCategory; name: string };
}

/** Bir plakanın depo/sahip bazlı stok seviyesi (konsinye-farkında). */
export interface PlateStockLevel {
  id: string;
  plateId: string;
  warehouseId: string;
  warehouse?: Warehouse;
  ownerCustomerId?: string | null;
  quantity: number;
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
  pendingExpenses: number;
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
  // Konsinye (sahibin malı) satışında sahip payı yöntemi.
  ownerSettlement?: 'manual_amount' | 'commission_percent';
  ownerAmount?: number;
  commissionPercent?: number;
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

/** Listelerde gösterim için yeterli, kısa plaka bilgisi (kalan ebat dahil). */
export interface PlateBrief {
  name: string;
  measurementType?: MeasurementType;
  widthMm?: number | null;
  heightMm?: number | null;
  thicknessMm?: number | null;
}

export interface ProcessingJob {
  id: string;
  plateId: string;
  plate?: PlateBrief;
  customerId?: string;
  customer?: { name: string };
  status: ProcessingStatus;
  billingUnit: MeasurementType;
  quantityValue: number;
  totalCost: number;
  currency: string;
  processedAt: string;
  completedAt?: string | null;
  note?: string | null;
  machineId?: string | null;
  quoteId?: string | null;
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
