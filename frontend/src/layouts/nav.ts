import type { ShopModule } from '../types';

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
      { to: '/shop-transfers', label: 'Dükkânlar Arası', title: 'Dükkânlar Arası Satış', icon: '🔁', anyOf: ['sales', 'purchases'], multiShop: true, keywords: 'dükkân şube transfer aktarım satış alış' },
      { to: '/expenses', label: 'Gider', title: 'Giderler', icon: '🧾', module: 'expenses', keywords: 'masraf' },
      { to: '/bank-reconciliation', label: 'Mutabakat', title: 'Banka Mutabakatı', icon: '🏦', module: 'banking', keywords: 'banka ekstre' },
      { to: '/reports', label: 'Rapor', title: 'Mali Dashboard', icon: '📊', module: 'reports', keywords: 'rapor kâr zarar dashboard' },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { to: '/price-rules', label: 'Fiyat Çatıları', title: 'Fiyat Çatıları', icon: '💰', module: 'catalog', keywords: 'fiyat çatı malzemeci tedarikçi referans döviz dolar satış önerisi' },
      { to: '/material-templates', label: 'Ürün Türleri', title: 'Ürün Türleri', icon: '🗂️', module: 'catalog', keywords: 'katalog şablon marka renk kalınlık ebat' },
      { to: '/material-categories', label: 'Malzeme Türleri', title: 'Malzeme Türleri', icon: '🏷️', module: 'catalog', keywords: 'katalog kategori pleksi' },
      { to: '/team', label: 'Ekip', title: 'Ekip ve yetkiler', icon: '👥', team: true, keywords: 'çalışan kullanıcı yetki dükkân' },
      { to: '/settings', label: 'Ayarlar', title: 'Dükkân ayarları', icon: '⚙️', module: 'settings', keywords: 'ayar telegram corel yedek' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Bu kullanıcının seçili dükkânda görebildiği menü öğeleri. */
export function visibleNav(
  can: (m: ShopModule) => boolean,
  managesAnyShop: boolean,
  shopCount = 1,
): NavGroup[] {
  const visible = (n: NavItem): boolean => {
    if (n.team) return managesAnyShop;
    if (n.multiShop && shopCount < 2) return false;
    if (n.anyOf) return n.anyOf.some((m) => can(m));
    return !n.module || can(n.module);
  };
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter(
    (g) => g.items.length > 0,
  );
}
