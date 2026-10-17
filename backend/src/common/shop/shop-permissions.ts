/**
 * Dükkân içi yetki alanları. Her kullanıcının her dükkânda, her alan için
 * ayrı ayrı OKUMA ve YAZMA izni vardır; sistem sahibi (OWNER) bunlardan
 * muaftır.
 *
 * Okuma: listeleri, kartları, belgeleri görmek. Yazma: eklemek, düzeltmek,
 * silmek, durum değiştirmek. İkisi birbirinden bağımsız işaretlenir.
 */
export const SHOP_MODULES = [
  'stock',
  'catalog',
  'purchases',
  'processing',
  'quotes',
  'sales',
  'customers',
  'payments',
  'expenses',
  'banking',
  'reports',
  'settings',
] as const;

export type ShopModule = (typeof SHOP_MODULES)[number];

export type AccessLevel = 'read' | 'write';

export interface ModuleAccess {
  read: boolean;
  write: boolean;
}

export type ShopPermissions = Record<ShopModule, ModuleAccess>;

/** Arayüzde ve hata iletilerinde gösterilen adlar. */
export const SHOP_MODULE_LABELS: Record<ShopModule, string> = {
  stock: 'Stok ve depo',
  catalog: 'Katalog, tarifeler ve makineler',
  purchases: 'Satın alma ve tedarikçiler',
  processing: 'İş kuyruğu',
  quotes: 'Teklifler',
  sales: 'Satışlar',
  customers: 'Müşteriler',
  payments: 'Ödemeler ve cari hesap',
  expenses: 'Giderler',
  banking: 'Banka hesapları ve mutabakat',
  reports: 'Raporlar',
  settings: 'Dükkân ayarları',
};

export function isShopModule(value: unknown): value is ShopModule {
  return typeof value === 'string' && (SHOP_MODULES as readonly string[]).includes(value);
}

function build(fn: (m: ShopModule) => ModuleAccess): ShopPermissions {
  return Object.fromEntries(SHOP_MODULES.map((m) => [m, fn(m)])) as ShopPermissions;
}

export function noPermissions(): ShopPermissions {
  return build(() => ({ read: false, write: false }));
}

export function fullPermissions(): ShopPermissions {
  return build(() => ({ read: true, write: true }));
}

/**
 * Çok dükkâna geçişten önce "Çalışan" rolünün fiilen sahip olduğu erişim:
 * sistem sahibine ayrılmış ekranlar (rapor, gider, mutabakat, ayarlar,
 * katalog düzenleme) dışındaki her şey. Mevcut çalışanlar ilk dükkâna bu
 * izinlerle eklenir; kimsenin erişimi geçişle değişmez.
 */
export function legacyEmployeePermissions(): ShopPermissions {
  const p = noPermissions();
  for (const m of ['stock', 'purchases', 'processing', 'quotes', 'sales', 'customers', 'payments'] as const) {
    p[m] = { read: true, write: true };
  }
  return p;
}

/** Dışarıdan gelen (DTO / JSON sütunu) değeri eksiksiz, yalnız bilinen alanlarla döndürür. */
export function normalizePermissions(input: unknown): ShopPermissions {
  const p = noPermissions();
  if (!input || typeof input !== 'object') return p;
  for (const m of SHOP_MODULES) {
    const v = (input as Record<string, unknown>)[m];
    if (v && typeof v === 'object') {
      p[m] = {
        read: (v as Record<string, unknown>).read === true,
        write: (v as Record<string, unknown>).write === true,
      };
    }
  }
  return p;
}

export function can(p: ShopPermissions, module: ShopModule, level: AccessLevel): boolean {
  return p[module]?.[level] === true;
}

/** `inner`'daki her izin `outer`'da da var mı? (yönetici yalnız sahip olduğunu verebilir) */
export function isSubset(inner: ShopPermissions, outer: ShopPermissions): boolean {
  return SHOP_MODULES.every(
    (m) => (!inner[m].read || outer[m].read) && (!inner[m].write || outer[m].write),
  );
}

/** `inner`'da olup `outer`'da olmayan izinler (hata iletisinde gösterilir). */
export function excessPermissions(inner: ShopPermissions, outer: ShopPermissions): string[] {
  const out: string[] = [];
  for (const m of SHOP_MODULES) {
    if (inner[m].read && !outer[m].read) out.push(`${SHOP_MODULE_LABELS[m]} (okuma)`);
    if (inner[m].write && !outer[m].write) out.push(`${SHOP_MODULE_LABELS[m]} (yazma)`);
  }
  return out;
}
