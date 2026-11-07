/**
 * Önbellek grupları: bir grubun girdileri, ilgili tablolardan birine yazılınca
 * TOPTAN silinir (anahtar anahtar aramak yok). Grup, bir uç noktanın okuduğu
 * bütün tabloları kapsamalıdır; kapsamıyorsa o uç nokta bu grupla önbelleğe
 * alınmaz (aşağıdaki "shop" grubu her şeyi kapsar).
 *
 * Kapsam (scope): dükkâna bağlı veri → dükkân kimliği; platform geneli
 * veri (rehber, erişim, etiketler) → GLOBAL_SCOPE.
 */
export const GLOBAL_SCOPE = 'g';

export const CacheGroup = {
  /** Dükkânın HERHANGİ bir tablosuna yazılınca silinir: liste/özet gibi geniş okumalar için. */
  SHOP: 'shop',
  /** Dükkân ve üyelik kayıtları (kim hangi dükkâna girebilir). */
  ACCESS: 'access',
  /** Kullanıcı kayıtları (oturum doğrulaması). */
  USERS: 'users',
  /** Malzeme türleri, markalar, renkler, ebatlar, kalınlıklar, şablonlar. */
  CATALOG: 'catalog',
  /** Dükkân ayarları. */
  SETTINGS: 'settings',
  /** Depolar. */
  WAREHOUSES: 'warehouses',
  /** İşletme rehberi: işletmeler, etiketler, makineler. */
  DIRECTORY: 'directory',
  /** Platform ayarları, etiket ve makine türü tanımları. */
  PLATFORM: 'platform',
} as const;

export type CacheGroupName = (typeof CacheGroup)[keyof typeof CacheGroup];

/** Dükkâna bağlı tabloya yazılınca, o dükkânın bu grupları da silinir ("shop" her zaman silinir). */
export const SHOP_TABLE_GROUPS: Record<string, readonly string[]> = {
  material_categories: [CacheGroup.CATALOG],
  material_brands: [CacheGroup.CATALOG],
  material_colors: [CacheGroup.CATALOG],
  material_sizes: [CacheGroup.CATALOG],
  material_thicknesses: [CacheGroup.CATALOG],
  material_templates: [CacheGroup.CATALOG],
  app_settings: [CacheGroup.SETTINGS],
  warehouses: [CacheGroup.WAREHOUSES],
};

/** Hangi tabloya yazılınca GLOBAL kapsamdaki hangi gruplar silinir. */
export const GLOBAL_TABLE_GROUPS: Record<string, readonly string[]> = {
  shops: [CacheGroup.ACCESS, CacheGroup.DIRECTORY],
  shop_members: [CacheGroup.ACCESS],
  users: [CacheGroup.USERS, CacheGroup.ACCESS],
  machines: [CacheGroup.DIRECTORY],
  business_labels: [CacheGroup.DIRECTORY, CacheGroup.PLATFORM],
  shop_labels: [CacheGroup.DIRECTORY],
  machine_types: [CacheGroup.DIRECTORY, CacheGroup.PLATFORM],
  machine_type_sizes: [CacheGroup.DIRECTORY, CacheGroup.PLATFORM],
  system_settings: [CacheGroup.PLATFORM],
};

/**
 * Yazılması hiçbir önbellek girdisini etkilemeyen, SIK yazılan tablolar:
 * bunlar sayılırsa önbellek durmadan boşalırdı.
 */
export const IGNORED_TABLES: ReadonlySet<string> = new Set([
  'idempotency_keys',
  'sync_changes',
  'sync_replicas',
  'replica_outbox',
  'replica_state',
  'notifications',
  'corel_runners',
  'exchange_rates',
  'typeorm_metadata',
  'migrations',
]);
