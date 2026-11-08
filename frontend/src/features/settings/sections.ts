/**
 * Ayarlar ekranının bölümleri: hızlı geçiş şeridi, arama ve kart başlıkları.
 * Ayrı dosyadadır — hızlı arama (Ctrl+K) Ayarlar ekranının parçasını
 * yüklemeden bölümleri listeleyebilsin.
 */

import type { ShopFeatureKey } from '../../types';

export type SectionId =
  | 'isletme'
  | 'gorunum'
  | 'fiyatlandirma'
  | 'corel'
  | 'yerel-sunucu'
  | 'katalog'
  | 'kilit'
  | 'telegram'
  | 'sabah-ozeti'
  | 'yedek'
  | 'bakim'
  | 'bildirimler';

export interface SectionMeta {
  id: SectionId;
  icon: string;
  title: string;
  /** Şeritteki kısa ad. */
  short: string;
  /** Başlığın altındaki tek satırlık açıklama. */
  description: string;
  /** Aramada eşleşen ek sözcükler. */
  keywords: string;
  /** Yalnız sistem sahibine görünür (sayfadaki koşulla aynı). */
  ownerOnly?: boolean;
  /** Sistem sahibinin işletmeye açtığı özellik gerekir (kapalıysa bölüm hiç görünmez). */
  feature?: ShopFeatureKey;
}

/** Sayfadaki sırayla bütün bölümler (hızlı arama da bu listeyi kullanır). */
export const SECTIONS: SectionMeta[] = [
  {
    id: 'isletme',
    icon: '🏪',
    title: 'İşletme bilgileri',
    short: 'İşletme',
    description: 'Belgelerde ve uygulama başlığında görünen ad, adres ve iletişim bilgileri.',
    keywords: 'ad isim adres telefon vergi vkn pdf belge fatura başlık',
  },
  {
    id: 'gorunum',
    icon: '👁️',
    title: 'Görünüm',
    short: 'Görünüm',
    description: 'Ekranda hangi hassas düğmelerin görüneceği.',
    keywords: 'geri al ekstre cari düğme gizle göster',
  },
  {
    id: 'fiyatlandirma',
    icon: '💰',
    title: 'Fiyatlandırma',
    short: 'Fiyatlandırma',
    description: 'Tek menüden birim fiyatlar: metre, m², süre ve adet; malzeme satış kârı ve komisyon.',
    keywords:
      'fiyat ücret birim metre m2 metrekare süre saatlik dakika adet kâr kar yüzde marj markup konsinye komisyon perakende kesim işçilik asgari',
  },
  {
    id: 'corel',
    icon: '🖌️',
    title: 'Corel entegrasyonu',
    short: 'Corel',
    description: 'CorelDRAW eklentisinin bağlanacağı sunucu adresi ve anahtar.',
    keywords: 'coreldraw eklenti ac2f anahtar api key dxf runner klasör',
    feature: 'corel',
  },
  {
    id: 'yerel-sunucu',
    icon: '🖥️',
    title: 'Yerel sunucular (çevrimdışı çalışma)',
    short: 'Yerel sunucu',
    description: 'Dükkândaki yerel sunucu internet ya da merkez giderse çalışmaya devam eder, bağlantı gelince eşitlenir.',
    keywords: 'replika offline çevrimdışı internet kesinti eşitleme senkron yerel sunucu anahtar token',
    ownerOnly: true,
  },
  {
    id: 'katalog',
    icon: '🗂️',
    title: 'Katalog sağlığı',
    short: 'Katalog',
    description: 'Farklı yazılmış tür/marka/renk kopyalarını bulur ve birleştirir.',
    keywords: 'kopya birleştir tekrar mükerrer marka renk ebat kalınlık şablon',
  },
  {
    id: 'kilit',
    icon: '🔒',
    title: 'Ekran kilidi',
    short: 'Ekran kilidi',
    description: 'İşlem yapılmayınca bu cihazda arayüzü PIN ile kilitler.',
    keywords: 'pin şifre parola kilitle süre dakika güvenlik',
  },
  {
    id: 'telegram',
    icon: '📨',
    title: 'Telegram',
    short: 'Telegram',
    description: 'Bildirim ve hatırlatmaların gittiği Telegram grubu (botu grubunuza eklersiniz).',
    keywords: 'bot grup sohbet chat id bildirim test mesaj',
  },
  {
    id: 'sabah-ozeti',
    icon: '☀️',
    title: 'Sabah özeti',
    short: 'Sabah özeti',
    description: 'Her sabah Telegram’a bekleyen işler, stok ve teklif durumu.',
    keywords: 'günlük rapor telegram bekleyen iş plaka stok teklif',
  },
  {
    id: 'yedek',
    icon: '🗄️',
    title: 'Veritabanı yedekleme',
    short: 'Yedek',
    description: 'Yedek indirme, Telegram’a şifreli yedek ve geri yükleme.',
    keywords: 'backup sql enc şifreli geri yükle indir anahtar',
    ownerOnly: true,
  },
  {
    id: 'bakim',
    icon: '🧹',
    title: 'Bakım — kayıt ve log temizliği',
    short: 'Bakım',
    description: 'Biriken bildirim kayıtlarını, eski yedek dosyalarını ve logları temizler.',
    keywords: 'log temizlik temizle sil docker yedek dosya disk',
    ownerOnly: true,
  },
  {
    id: 'bildirimler',
    icon: '🔔',
    title: 'Bildirim geçmişi',
    short: 'Bildirimler',
    description: 'Gönderilen son bildirimler ve sonuçları.',
    keywords: 'gönderim defteri log telegram hata yedek borç stok',
  },
];


/**
 * Bu kullanıcının görebildiği bölümler: sistem sahibine özel olanlar yalnız sistem
 * sahibine, bir özelliğe bağlı olanlar (Corel ...) yalnız o özelliği açık işletmeye.
 * Ayarlar ekranı ve hızlı arama (Ctrl+K) aynı listeyi kullanır; kapalı özelliğin
 * adı hiçbir yerde (bölüm, arama, öneri) görünmez.
 */
export function visibleSections(isOwner: boolean, hasFeature: (f: ShopFeatureKey) => boolean): SectionMeta[] {
  return SECTIONS.filter((s) => (!s.ownerOnly || isOwner) && (!s.feature || hasFeature(s.feature)));
}
