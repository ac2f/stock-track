import type { ShopFeatureKey, ShopModule } from '../types';

export interface NavItem {
  to: string;
  label: string;
  /** Sayfa başlığı ve hızlı aramada görünen uzun ad. */
  title: string;
  icon: string;
  /** Seçili dükkânda bu alanı görme izni olan görür. */
  module?: ShopModule;
  /** Ekip ekranı: sistem sahibi ve dükkân yöneticileri. */
  team?: boolean;
  /** Bu alanlardan birini görebilen görür (`module` yerine). */
  anyOf?: ShopModule[];
  /** Yalnız birden çok dükkâna girebilen kullanıcıya gösterilir. */
  multiShop?: boolean;
  /** Yalnız sistem sahibi (platform yönetimi). */
  owner?: boolean;
  /** Sistem sahibinin işletmeye açtığı özellik gerekir (kapalıysa menüde yoktur). */
  feature?: ShopFeatureKey;
  /** Hızlı aramada eşleşecek ek sözcükler. */
  keywords?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Menü grupları; telefondaki alt çubukta ilk dört görünür öğe yer alır. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Günlük işler',
    items: [
      { to: '/plates', label: 'Stok', title: 'Stok / Plakalar', icon: '📦', module: 'stock', keywords: 'plaka depo malzeme' },
      { to: '/quotes', label: 'Teklif', title: 'Teklifler', icon: '📝', module: 'quotes', keywords: 'fiyat teklifi' },
      { to: '/queue', label: 'Kuyruk', title: 'Üretim Kuyruğu', icon: '🛠️', module: 'processing', keywords: 'iş kesim işleme üretim' },
      { to: '/payments', label: 'Tahsilat', title: 'Ödemeler / Tahsilat', icon: '💵', module: 'payments', keywords: 'ödeme kasa nakit' },
    ],
  },
  {
    label: 'Cari ve finans',
    items: [
      { to: '/customers', label: 'Cari', title: 'Müşteriler / Cari', icon: '💳', module: 'customers', keywords: 'müşteri borç ekstre' },
      { to: '/purchases', label: 'Satın Alma', title: 'Satın Alma', icon: '🛒', module: 'purchases', keywords: 'tedarikçi alış' },
      { to: '/shop-transfers', label: 'İşletmeler Arası', title: 'İşletmeler Arası Satış', icon: '🔁', anyOf: ['sales', 'purchases', 'stock', 'settings'], feature: 'trade', keywords: 'işletme dükkân şube transfer aktarım satış alış onay bende var stok paylaşım pazar yetki otomatik onay' },
      { to: '/expenses', label: 'Gider', title: 'Giderler', icon: '🧾', module: 'expenses', keywords: 'masraf' },
      { to: '/bank-reconciliation', label: 'Mutabakat', title: 'Banka Mutabakatı', icon: '🏦', module: 'banking', keywords: 'banka ekstre' },
      { to: '/reports', label: 'Rapor', title: 'Mali Dashboard', icon: '📊', module: 'reports', keywords: 'rapor kâr zarar dashboard' },
    ],
  },
  {
    label: 'İşletmeler ağı',
    items: [
      { to: '/directory', label: 'Rehber', title: 'İşletme Rehberi', icon: '🧭', feature: 'directory', keywords: 'işletme firma rehber il ilçe makine lazer cnc ebat etiket iş kolu ara bul telefon' },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { to: '/business', label: 'İşletme Profili', title: 'İşletme profili ve makineler', icon: '🪪', anyOf: ['settings', 'catalog'], keywords: 'profil adres il ilçe iletişim etiket makine envanter ebat rehber paylaşım borç uyarı' },
      { to: '/platform', label: 'Platform', title: 'Platform yönetimi', icon: '🛰️', owner: true, keywords: 'kiralama işletme onay kayıt etiket makine türü abonelik süre askıya redis önbellek' },
      { to: '/price-rules', label: 'Fiyat Çatıları', title: 'Fiyat Çatıları', icon: '💰', module: 'catalog', keywords: 'fiyat çatı malzemeci tedarikçi referans döviz dolar satış önerisi' },
      { to: '/catalog', label: 'Katalog', title: 'Katalog', icon: '🗂️', module: 'catalog', keywords: 'ürün türü malzeme türü şablon kategori marka renk kalınlık ebat pleksi dekota' },
      { to: '/team', label: 'Ekip', title: 'Ekip ve yetkiler', icon: '👥', team: true, keywords: 'çalışan kullanıcı yetki dükkân' },
      { to: '/settings', label: 'Ayarlar', title: 'Dükkân ayarları', icon: '⚙️', module: 'settings', keywords: 'ayar telegram fiyat yedek' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Bu kullanıcının seçili dükkânda görebildiği menü öğeleri. */
export function visibleNav(
  can: (m: ShopModule) => boolean,
  managesAnyShop: boolean,
  shopCount = 1,
  isOwner = false,
  hasFeature: (f: ShopFeatureKey) => boolean = () => true,
): NavGroup[] {
  const visible = (n: NavItem): boolean => {
    if (n.owner) return isOwner;
    if (n.feature && !hasFeature(n.feature)) return false;
    if (n.team) return managesAnyShop;
    if (n.multiShop && shopCount < 2) return false;
    if (n.anyOf) return n.anyOf.some((m) => can(m));
    return !n.module || can(n.module);
  };
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter(
    (g) => g.items.length > 0,
  );
}
