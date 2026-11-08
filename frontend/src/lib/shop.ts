import type { ModuleAccess, ShopFeatureKey, ShopFeatures, ShopModule, ShopPermissions } from '../types';

/**
 * Seçili dükkân. Her API isteği `X-Shop-Id` başlığıyla bu dükkân adına
 * yapılır (bkz. api/client.ts). Seçim bu cihazda hatırlanır.
 */
const KEY = 'st_shop';

export function getActiveShopId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveShopId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* depolama kapalı: seçim yalnız bu oturumda geçerli */
  }
}

/** İzin tablosunun sırası ve adları (backend ile aynı). */
export const SHOP_MODULES: { key: ShopModule; label: string; hint: string }[] = [
  { key: 'stock', label: 'Stok ve depo', hint: 'Plakalar, stok girişi, depolar' },
  { key: 'catalog', label: 'Katalog, tarifeler, makineler', hint: 'Malzeme türleri/şablonları, işleme tarifeleri' },
  { key: 'purchases', label: 'Satın alma ve tedarikçiler', hint: 'Alışlar, tedarikçiler, araçlar' },
  { key: 'processing', label: 'İş kuyruğu', hint: 'Kesim/işleme işleri' },
  { key: 'quotes', label: 'Teklifler', hint: 'Teklif yazma, onay, işe/satışa dönüştürme' },
  { key: 'sales', label: 'Satışlar', hint: 'Malzeme satışı' },
  { key: 'customers', label: 'Müşteriler', hint: 'Müşteri listesi ve kartları' },
  { key: 'payments', label: 'Ödemeler ve cari', hint: 'Tahsilat, ekstre, cari hareketleri' },
  { key: 'expenses', label: 'Giderler', hint: 'Gider kayıtları ve projeler' },
  { key: 'banking', label: 'Banka ve mutabakat', hint: 'Banka hesapları, ekstre eşleştirme' },
  { key: 'reports', label: 'Raporlar', hint: 'Kâr-zarar, yaşlandırma, stok değeri' },
  { key: 'settings', label: 'Dükkân ayarları', hint: 'İşletme bilgileri, fiyatlar, Telegram sohbeti' },
];

const none = (): ModuleAccess => ({ read: false, write: false });

function build(fn: (m: ShopModule) => ModuleAccess): ShopPermissions {
  return Object.fromEntries(SHOP_MODULES.map(({ key }) => [key, fn(key)])) as ShopPermissions;
}

/** Hazır izin kümeleri (ekip ekranındaki düğmeler). */
export const PERMISSION_PRESETS: { label: string; build: () => ShopPermissions }[] = [
  { label: 'Hiçbiri', build: () => build(none) },
  { label: 'Hepsini görür', build: () => build(() => ({ read: true, write: false })) },
  {
    label: 'Tezgâh (çalışan)',
    build: () =>
      build((m) =>
        ['stock', 'purchases', 'processing', 'quotes', 'sales', 'customers', 'payments'].includes(m)
          ? { read: true, write: true }
          : none(),
      ),
  },
  { label: 'Tam yetki', build: () => build(() => ({ read: true, write: true })) },
];

export function emptyPermissions(): ShopPermissions {
  return build(none);
}

/** Sistem sahibinin işletmeye açtığı özellikler: adlar (Platform ekranı) ve varsayılanlar (backend ile aynı). */
export const SHOP_FEATURES: { key: ShopFeatureKey; label: string; hint: string; default: boolean }[] = [
  {
    key: 'corel',
    label: 'Corel eklentisi ve klasör oluşturucu',
    hint: 'CorelDRAW eklentisi, dükkân bilgisayarındaki runner, otomatik klasörler ve makine hızı ayarları.',
    default: false,
  },
  {
    key: 'network',
    label: 'Müşteri ve borç ağı',
    hint: 'Aynı telefonla başka işletmede kayıtlı müşteri önerisi ve borç uyarısı.',
    default: true,
  },
  {
    key: 'directory',
    label: 'İşletme rehberi',
    hint: 'Diğer işletmeleri iş koluna, ile/ilçeye ve makineye göre arama; kendi işletmesini listeletme.',
    default: true,
  },
];

export function defaultFeatures(): ShopFeatures {
  return Object.fromEntries(SHOP_FEATURES.map((f) => [f.key, f.default])) as ShopFeatures;
}

/** Sunucunun yazmadığı (eski oturum) özellik varsayılanına düşer. */
export function resolveFeatures(stored: Partial<ShopFeatures> | undefined | null): ShopFeatures {
  return { ...defaultFeatures(), ...(stored ?? {}) };
}
