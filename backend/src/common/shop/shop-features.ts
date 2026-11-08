/**
 * İşletme (dükkân) özellikleri: sistem sahibinin (platform yöneticisi) her
 * işletme için ayrı ayrı AÇIP KAPATTIĞI isteğe bağlı modüller.
 *
 * İzinlerden (shop-permissions.ts) farkı: izinler "bu işletmenin çalışanı ne
 * yapabilir"i, yöneticisi belirler; özellikler ise "bu işletme hangi hizmeti
 * hiç kullanabilir"i, yalnız sistem sahibi belirler. İşletme yöneticisi bir
 * özelliği kendisi açamaz; kapalı özellik hem arayüzden hem API'den kalkar.
 */
export const SHOP_FEATURES = ['corel', 'network', 'directory', 'trade'] as const;

export type ShopFeature = (typeof SHOP_FEATURES)[number];

export type ShopFeatures = Record<ShopFeature, boolean>;

/** Platform ekranında gösterilen ad ve açıklamalar. */
export const SHOP_FEATURE_INFO: Record<ShopFeature, { label: string; hint: string; default: boolean }> = {
  corel: {
    label: 'Corel eklentisi ve klasör oluşturucu',
    hint: 'CorelDRAW eklentisi, dükkân bilgisayarındaki runner, otomatik klasörler ve makine hızı ayarları.',
    // Kapalı başlar: yalnız sistem sahibinin seçtiği işletmeler kullanır.
    default: false,
  },
  network: {
    label: 'Müşteri ve borç ağı',
    hint: 'Aynı telefonla başka işletmede kayıtlı müşteri önerisi ve borç uyarısı.',
    default: true,
  },
  directory: {
    label: 'İşletme rehberi',
    hint: 'Diğer işletmeleri iş koluna, ile/ilçeye ve makineye göre arama; kendi işletmesini listeletme.',
    default: true,
  },
  trade: {
    label: 'İşletmeler arası satış ve stok paylaşımı',
    hint: 'Başka işletmelere satış teklifi (onay/ret), paylaşılan stok listesi, ortak yetkileri ve başka işletmelerin ürün türlerinden seçme.',
    default: true,
  },
};

export function isShopFeature(value: unknown): value is ShopFeature {
  return typeof value === 'string' && (SHOP_FEATURES as readonly string[]).includes(value);
}

/** Her özelliğin varsayılanı (kayıt yoksa bu değer geçer). */
export function defaultFeatures(): ShopFeatures {
  return Object.fromEntries(SHOP_FEATURES.map((f) => [f, SHOP_FEATURE_INFO[f].default])) as ShopFeatures;
}

/** Her özellik açık (sistem sahibi hiçbir kısıta takılmaz). */
export function allFeatures(): ShopFeatures {
  return Object.fromEntries(SHOP_FEATURES.map((f) => [f, true])) as ShopFeatures;
}

/**
 * Saklanan değeri (JSON sütunu / DTO) eksiksiz, yalnız bilinen anahtarlarla ve
 * boolean değerlerle çözer. Yazılmamış özellik varsayılanına düşer.
 */
export function resolveFeatures(stored: unknown): ShopFeatures {
  const out = defaultFeatures();
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const f of SHOP_FEATURES) {
      const v = (stored as Record<string, unknown>)[f];
      if (typeof v === 'boolean') out[f] = v;
    }
  }
  return out;
}

/**
 * Mevcut kayıtlı değere bir değişiklik uygular: yalnız bilinen anahtarlar ve
 * boolean değerler geçer, gerisi atılır. Sonuç saklanacak (eksik anahtarlı
 * olabilen) nesnedir.
 */
export function mergeFeatures(
  stored: unknown,
  patch: unknown,
): Partial<Record<ShopFeature, boolean>> {
  const base: Partial<Record<ShopFeature, boolean>> = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const f of SHOP_FEATURES) {
      const v = (stored as Record<string, unknown>)[f];
      if (typeof v === 'boolean') base[f] = v;
    }
  }
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    for (const f of SHOP_FEATURES) {
      const v = (patch as Record<string, unknown>)[f];
      if (typeof v === 'boolean') base[f] = v;
    }
  }
  return base;
}
