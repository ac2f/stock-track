import { api } from './client';

/** İşletme/proje kimliği — belgelerde ve arayüz başlığında kullanılır. */
export interface BusinessSettings {
  name: string;
  address: string;
  phone: string;
  taxNo: string;
  logoPath: string;
  portalBaseUrl: string;
  defaultCurrency: string;
}

export interface UpdateBusinessInput {
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessTaxNo?: string;
  businessLogoPath?: string;
  portalBaseUrl?: string;
}

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  const { data } = await api.get<BusinessSettings>('/settings/business');
  return data;
}

export async function updateBusinessSettings(
  input: UpdateBusinessInput,
): Promise<unknown> {
  const { data } = await api.put('/settings/business', input);
  return data;
}

// ── Telegram ────────────────────────────────────────────────────────────
/** Ayarın nereden geldiği: arayüz (db) · .env dosyası (env) · tanımsız. */
export type SettingSource = 'db' | 'env' | 'none';

/** Telegram durumu. Jeton hiçbir zaman açık gelmez, yalnızca maskeli. */
export interface TelegramSettings {
  configured: boolean;
  tokenSet: boolean;
  tokenMasked: string;
  tokenSource: SettingSource;
  chatId: string;
  chatIdSource: SettingSource;
  backupChatId: string;
  /** Yedeğin gerçekte gideceği sohbet (backupChatId boşsa chatId). */
  effectiveBackupChatId: string;
  backupCron: string;
  /** Telegram'dan işlem yapabilecek kullanıcı kimlikleri. */
  allowedUserIds: string[];
  /** Konu başına hedefler (satış, stok, Corel ...). */
  routes: TelegramRoute[];
  /** Bildirim sohbetini kullanan diğer dükkânlar. */
  chatSharedWith: string[];
}

export type TelegramTopic = 'sales' | 'payments' | 'stock' | 'debt' | 'morning' | 'corel';

/** Bir konunun hedefi: bildirim sohbeti, başka sohbet ya da kapalı. */
export interface TelegramRoute {
  topic: TelegramTopic;
  label: string;
  hint: string;
  mode: 'default' | 'chat' | 'off';
  chatId: string;
  effectiveChatId: string;
  /** Aynı sohbete gönderen diğer dükkânlar. */
  sharedWith: string[];
}

export interface UpdateTelegramInput {
  /** Gönderilmezse değişmez; boş gönderilirse temizlenir (.env'e düşer). */
  telegramBotToken?: string;
  telegramChatId?: string;
  backupTelegramChatId?: string;
  /** Virgülle ayrılmış Telegram kullanıcı kimlikleri. */
  telegramAllowedUserIds?: string;
  /** Konu başına hedefler; verilen nesne öncekinin yerine geçer. */
  telegramRoutes?: Partial<Record<TelegramTopic, { chatId?: string; off?: boolean }>>;
}

export async function fetchTelegramSettings(): Promise<TelegramSettings> {
  const { data } = await api.get<TelegramSettings>('/settings/telegram');
  return data;
}

export async function updateTelegramSettings(
  input: UpdateTelegramInput,
): Promise<TelegramSettings> {
  const { data } = await api.put<TelegramSettings>('/settings/telegram', input);
  return data;
}

export interface TelegramReloadResult {
  ok: boolean;
  botUsername?: string;
  botName?: string;
  chatId: string;
  backupChatId: string;
  error?: string;
}

/** Telegram'ı yeniden başlatır: ayarları tazeler ve jetonu doğrular. */
export async function reloadTelegram(): Promise<TelegramReloadResult> {
  const { data } = await api.post<TelegramReloadResult>(
    '/notifications/telegram/reload',
  );
  return data;
}

/** Ayarlardaki sohbete (konu verilirse o konunun sohbetine) deneme mesajı gönderir. */
export async function testTelegram(topic?: TelegramTopic): Promise<{
  success: boolean;
  error?: string;
  chatId: string;
}> {
  const { data } = await api.post<{
    success: boolean;
    error?: string;
    chatId: string;
  }>('/notifications/telegram/test', undefined, { params: topic ? { topic } : undefined });
  return data;
}

// ── Klasör oluşturucu (runner) ──────────────────────────────────────────
/** Dükkânın klasör oluşturucusu: runner bu dükkânın anahtarıyla bağlanınca okur. */
export interface FolderSettings {
  shopName: string;
  enabled: boolean;
  /** Belirteçte kullanılan kod (yazılan ya da dükkân adından). */
  code: string;
  /** Yazılan kod; boş = dükkân adından. */
  customCode: string;
  materialSaleFolders: boolean;
  dayRoot: string;
}

export async function fetchFolderSettings(): Promise<FolderSettings> {
  const { data } = await api.get<FolderSettings>('/settings/folders');
  return data;
}

export async function updateFolderSettings(
  input: Partial<{ enabled: boolean; code: string; materialSaleFolders: boolean; dayRoot: string }>,
): Promise<FolderSettings> {
  const { data } = await api.put<FolderSettings>('/settings/folders', input);
  return data;
}

// ── Fiyatlandırma ───────────────────────────────────────────────────────
export interface PricingSettings {
  /** Perakende fiyatın üzerine eklenen genel kâr yüzdesi. */
  saleMarkupPercent: number;
  /** Başkasının malzemesi satılırken varsayılan komisyon yüzdesi. */
  consignmentCommissionPercent: number;
}

export async function fetchPricingSettings(): Promise<PricingSettings> {
  const { data } = await api.get<PricingSettings>('/settings/pricing');
  return data;
}

export async function updatePricingSettings(
  input: Partial<PricingSettings>,
): Promise<PricingSettings> {
  const { data } = await api.put<PricingSettings>('/settings/pricing', input);
  return data;
}

// ── Görünüm tercihleri ──────────────────────────────────────────────────
export interface DisplaySettings {
  /**
   * Cari ekstresinde "Geri al" düğmeleri görünsün mü? Varsayılan KAPALI —
   * ekran müşteriye gösterildiğinde yanlış anlaşılmasın diye.
   */
  showLedgerUndo: boolean;
}

export async function fetchDisplaySettings(): Promise<DisplaySettings> {
  const { data } = await api.get<DisplaySettings>('/settings/display');
  return data;
}

export async function updateDisplaySettings(
  input: Partial<DisplaySettings>,
): Promise<DisplaySettings> {
  const { data } = await api.put<DisplaySettings>('/settings/display', input);
  return data;
}

// ── Corel entegrasyonu ──────────────────────────────────────────────────
/**
 * CorelDRAW eklentisinin (ac2f pack) anahtarı. Eklenti müşteri ve stok
 * listesini bu anahtarla okur; boşken entegrasyon kapalıdır.
 */
export interface CorelIntegration {
  enabled: boolean;
  apiKey: string;
}

export async function fetchCorelIntegration(): Promise<CorelIntegration> {
  const { data } = await api.get<CorelIntegration>('/settings/corel');
  return data;
}

/** Yeni anahtar üretir; eski anahtar o anda geçersiz olur. */
export async function rotateCorelKey(): Promise<CorelIntegration> {
  const { data } = await api.post<CorelIntegration>('/settings/corel/rotate');
  return data;
}

/** Anahtarı siler, entegrasyonu kapatır. */
export async function disableCorelIntegration(): Promise<CorelIntegration> {
  const { data } = await api.delete<CorelIntegration>('/settings/corel');
  return data;
}

// ── Kesim fiyatlandırması ───────────────────────────────────────────────
/**
 * Süreyle ve m² ile fiyatın ücretleri ve asgarileri; Corel eklentisinin
 * süre hesabında kullandığı makine hızları.
 */
export interface CutPricing {
  /** Saatlik ücret (süreyle fiyat). */
  hourlyRate: number;
  /** İş en az bu kadar dakikadan faturalanır. */
  minMinutes: number;
  /** m² ücreti (m² ile fiyat). */
  areaRate: number;
  /** İş en az bu kadar m²'den faturalanır (Corel m² hesabı). */
  minArea: number;
  /** Kesim (ilerleme) hızı, mm/sn. */
  feedMmS: number;
  /** Boşta gezme hızı, mm/sn. */
  rapidMmS: number;
  /** Kontur başına dalma/kalkma süresi, sn. */
  plungeSec: number;
  /** Paso derinliği (mm); 0 = tek paso. */
  passDepthMm: number;
  currency: string;
}

export async function fetchCutPricing(): Promise<CutPricing> {
  const { data } = await api.get<CutPricing>('/settings/cut-pricing');
  return data;
}

export async function updateCutPricing(
  input: Partial<Omit<CutPricing, 'currency'>>,
): Promise<CutPricing> {
  const { data } = await api.put<CutPricing>('/settings/cut-pricing', input);
  return data;
}

// ── Sabah özeti ─────────────────────────────────────────────────────────
export interface MorningSummarySettings {
  enabled: boolean;
  /** Gönderim zamanı (cron, Türkiye saati). */
  cron: string;
}

export async function fetchMorningSummary(): Promise<MorningSummarySettings> {
  const { data } = await api.get<MorningSummarySettings>('/settings/morning-summary');
  return data;
}

export async function updateMorningSummary(
  enabled: boolean,
): Promise<MorningSummarySettings> {
  const { data } = await api.put<MorningSummarySettings>('/settings/morning-summary', {
    enabled,
  });
  return data;
}

/** Bugünün özeti (göndermeden). */
export async function previewMorningSummary(): Promise<string> {
  const { data } = await api.get<{ text: string }>('/notifications/morning-summary');
  return data.text;
}

/** Özeti şimdi Telegram'a gönderir. */
export async function sendMorningSummary(): Promise<string> {
  const { data } = await api.post<{ text: string }>('/notifications/morning-summary/send');
  return data.text;
}
