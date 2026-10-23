import { Column, Entity } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/**
 * Tek satırlık çalışma-zamanı ayarları. İşletme/proje kimliği (ad, adres,
 * telefon, VKN, logo, portal adresi) buradan düzenlenir ve belgelerde (PDF/HTML)
 * ile arayüz başlığında kullanılır. İlk erişimde .env varsayılanlarından tohumlanır.
 */
@Entity('app_settings')
export class AppSetting extends ShopScopedEntity {
  @Column({ name: 'business_name' })
  businessName: string;

  @Column({ name: 'business_address', type: 'text', default: '' })
  businessAddress: string;

  @Column({ name: 'business_phone', default: '' })
  businessPhone: string;

  @Column({ name: 'business_tax_no', default: '' })
  businessTaxNo: string;

  @Column({ name: 'business_logo_path', default: '' })
  businessLogoPath: string;

  @Column({ name: 'portal_base_url', default: '' })
  portalBaseUrl: string;

  // ── Telegram (arayüzden düzenlenir; boşsa .env değerine düşülür) ──
  /** Bot jetonu (@BotFather). Boşsa TELEGRAM_BOT_TOKEN kullanılır. */
  @Column({ name: 'telegram_bot_token', default: '' })
  telegramBotToken: string;

  /** Bildirim/hatırlatmaların gideceği sohbet. Boşsa TELEGRAM_OWNER_CHAT_ID. */
  @Column({ name: 'telegram_chat_id', default: '' })
  telegramChatId: string;

  /**
   * Konu başına Telegram hedefi: { sales: { chatId: '-100…' }, corel:
   * { off: true }, ... }. Yazılmayan konu bildirim sohbetine (telegramChatId)
   * gider. Birden çok dükkân aynı sohbeti kullanabilir; mesaja dükkân adı
   * eklenir.
   */
  @Column({ name: 'telegram_routes', type: 'jsonb', default: {} })
  telegramRoutes: Record<string, { chatId?: string; off?: boolean }>;

  /** Şifreli yedeğin gideceği sohbet. Boşsa yukarıdaki bildirim sohbeti. */
  @Column({ name: 'backup_telegram_chat_id', default: '' })
  backupTelegramChatId: string;

  /**
   * Telegram üzerinden İŞLEM YAPABİLECEK kullanıcıların sayısal kimlikleri
   * (virgülle ayrılmış). Liste boşken hiç kimse yetkili değildir — bot yalnızca
   * kişiye kendi kimliğini söyler. Grup kimliği DEĞİL, kullanıcı kimliğidir.
   */
  @Column({ name: 'telegram_allowed_user_ids', type: 'text', default: '' })
  telegramAllowedUserIds: string;

  // ── Fiyatlandırma ──
  /**
   * Malzeme satışında perakende fiyatın üzerine eklenen genel kâr yüzdesi.
   * Plakaya özel bir oran girilmişse o önceliklidir.
   */
  @Column({
    name: 'sale_markup_percent',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  saleMarkupPercent: number;

  /**
   * BAŞKA MÜŞTERİNİN malzemesi satıldığında işletmenin aldığı varsayılan
   * komisyon yüzdesi. Kalem bazında değiştirilebilir; teklif/satış bunu
   * başlangıç değeri olarak kullanır.
   */
  @Column({
    name: 'consignment_commission_percent',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  consignmentCommissionPercent: number;

  // ── Corel entegrasyonu ──
  /**
   * CorelDRAW eklentisinin (ac2f pack) müşteri/malzeme listesini okurken
   * gönderdiği anahtar (X-Api-Key). Boşken entegrasyon kapalıdır. Yalnız
   * okuma uçlarını açar; hiçbir kayıt yazmaz.
   */
  @Column({ name: 'corel_api_key', default: '' })
  corelApiKey: string;

  // ── Klasör oluşturucu (dükkân bilgisayarındaki runner) ──
  // Her dükkânın kendi ayarı: runner o dükkânın anahtarıyla bağlanınca
  // bunları okur (GET /corel/folder-settings).
  /** Kapalıyken runner bu dükkânın teklifleri için klasör açmaz. */
  @Column({ name: 'folders_enabled', default: true })
  foldersEnabled: boolean;

  /**
   * Klasör belirtecinde işletme malının sahibi olarak yazılan kısa kod
   * (F23-10-2026.<kod>.pleksi-beyaz). Boşsa dükkân adından türetilir.
   */
  @Column({ name: 'folder_code', default: '' })
  folderCode: string;

  /** Malzeme satışına (kesimsiz) malzeme-F... klasörü açılsın mı. */
  @Column({ name: 'material_sale_folders', default: true })
  materialSaleFolders: boolean;

  /**
   * Bu dükkânın gün klasörü kökü (dükkân bilgisayarında). Boşsa runner
   * kendi ayarını, Corel eklentisini ya da CDR Auto Renamer'ı kullanır.
   * Bir bilgisayar iki dükkâna klasör açıyorsa her birine ayrı kök verilir.
   */
  @Column({ name: 'folder_day_root', default: '' })
  folderDayRoot: string;

  // ── Kesim fiyatlandırması ──
  // Teklifte süreyle/m² ile fiyatın ücretleri ve asgarileri; Corel eklentisi
  // fiyat tahmininde bunları ve makine hızlarını okur.
  /** Süreyle faturalanan işin saatlik ücreti (baz para birimi). */
  @Column({
    name: 'cut_hourly_rate',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  cutHourlyRate: number;

  /** "İş en az X dakikadan başlar": süreyle işte asgari süre. */
  @Column({
    name: 'cut_min_minutes',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
  })
  cutMinMinutes: number;

  /** m² ile fiyatta m² ücreti (baz para birimi). */
  @Column({
    name: 'cut_area_rate',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  cutAreaRate: number;

  /** m² ile fiyatta asgari alan (m²). */
  @Column({
    name: 'cut_min_area',
    type: 'numeric',
    precision: 8,
    scale: 3,
    default: 0,
  })
  cutMinArea: number;

  /** Kesim (ilerleme) hızı, mm/sn — Corel süre hesabı. */
  @Column({
    name: 'cut_feed_mm_s',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 20,
  })
  cutFeedMmS: number;

  /** Boşta gezme hızı, mm/sn — Corel süre hesabı. */
  @Column({
    name: 'cut_rapid_mm_s',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 100,
  })
  cutRapidMmS: number;

  /** Kontur başına dalma/kalkma süresi, sn — Corel süre hesabı. */
  @Column({
    name: 'cut_plunge_sec',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 1,
  })
  cutPlungeSec: number;

  /** Paso derinliği (mm); 0 = tek paso. Kalınlık / derinlik = paso sayısı. */
  @Column({
    name: 'cut_pass_depth_mm',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
  })
  cutPassDepthMm: number;

  // ── Sabah özeti ──
  /** Her sabah Telegram'a günün işleri, gereken plakalar ve stok uyarıları. */
  @Column({ name: 'morning_summary_enabled', default: false })
  morningSummaryEnabled: boolean;

  // ── Görünüm ──
  /**
   * Cari ekstresinde hareketleri geri alma (silme) düğmeleri görünsün mü?
   *
   * VARSAYILAN KAPALI: ekran müşteriye gösterildiğinde "borcum siliniyor"
   * gibi yanlış anlaşılmasın. Kapalıyken yalnızca düğmeler gizlenir; yetkili
   * kullanıcı gerektiğinde ayarı açıp işlemi yapabilir.
   */
  @Column({ name: 'show_ledger_undo', default: false })
  showLedgerUndo: boolean;
}
