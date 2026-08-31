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
}

export interface UpdateTelegramInput {
  /** Gönderilmezse değişmez; boş gönderilirse temizlenir (.env'e düşer). */
  telegramBotToken?: string;
  telegramChatId?: string;
  backupTelegramChatId?: string;
  /** Virgülle ayrılmış Telegram kullanıcı kimlikleri. */
  telegramAllowedUserIds?: string;
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

/** Ayarlardaki sohbete deneme mesajı gönderir. */
export async function testTelegram(): Promise<{
  success: boolean;
  error?: string;
  chatId: string;
}> {
  const { data } = await api.post<{
    success: boolean;
    error?: string;
    chatId: string;
  }>('/notifications/telegram/test');
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
