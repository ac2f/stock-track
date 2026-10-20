/**
 * Ayarlar ekranının bölümleri: hızlı geçiş şeridi, arama ve kart başlıkları.
 * Ayrı dosyadadır — hızlı arama (Ctrl+K) Ayarlar ekranının parçasını
 * yüklemeden bölümleri listeleyebilsin.
 */

export type SectionId =
  | 'isletme'
  | 'gorunum'
  | 'satis-fiyat'
  | 'kesim-fiyat'
  | 'corel'
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
}

/** Sayfadaki sırayla bütün bölümler (hızlı arama da bu listeyi kullanır). */
export const SECTIONS: SectionMeta[] = [
  {
    id: 'isletme',
    icon: '🏪',
    title: 'İşletme bilgileri',
    short: 'İşletme',
    description: 'Belgelerde ve uygulama başlığında görünen ad, adres ve iletişim bilgileri.',
    keywords: 'ad isim adres telefon vergi vkn logo portal pdf belge fatura başlık',
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
    id: 'satis-fiyat',
    icon: '💰',
    title: 'Satış fiyatlandırması',
    short: 'Satış fiyatı',
    description: 'Malzeme satışında kâr yüzdesi ve konsinye komisyon oranı.',
    keywords: 'kâr kar yüzde marj markup konsinye komisyon perakende fiyat',
  },
  {
    id: 'kesim-fiyat',
    icon: '⏱️',
    title: 'Kesim fiyatlandırması',
    short: 'Kesim fiyatı',
    description: 'Süreyle ve m² ile fiyatlama, asgari tutarlar ve makine hızları.',
    keywords: 'saatlik ücret dakika m2 metrekare makine hız paso dalma corel süre cnc lazer',
  },
  {
    id: 'corel',
    icon: '🖌️',
    title: 'Corel entegrasyonu',
    short: 'Corel',
    description: 'CorelDRAW eklentisinin bağlanacağı sunucu adresi ve anahtar.',
    keywords: 'coreldraw eklenti ac2f anahtar api key dxf',
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
    description: 'Bildirim, hatırlatma ve yedeklerin gittiği bot ve sohbetler.',
    keywords: 'bot jeton token sohbet chat id bildirim yetkili kullanıcı test mesaj',
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

