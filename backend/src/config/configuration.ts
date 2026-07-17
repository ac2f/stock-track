/**
 * Tipli (typed) uygulama konfigürasyonu.
 * .env'den okunan tüm değerler tek bir yerden, tip güvenli biçimde sağlanır.
 * Hiçbir modül process.env'e doğrudan erişmez → DI ile ConfigService kullanır.
 */
export interface AppConfig {
  env: string;
  port: number;
  globalPrefix: string;
  corsOrigin: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
}

export interface JwtConfig {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface BusinessConfig {
  defaultCurrency: string;
  defaultRatePerM2: number;
  defaultWarehouseCode: string;
  // Belge (PDF fatura/irsaliye/teklif) kimliği.
  name: string;
  address: string;
  phone: string;
  taxNo: string;
  logoPath: string;
  // Müşteri portalı linklerinin temel adresi (token sonuna eklenir).
  portalBaseUrl: string;
}

export interface CurrencyConfig {
  base: string;
  apiUrl: string;
  syncCron: string;
}

export interface SchedulerConfig {
  enabled: boolean;
}

export interface BackupConfig {
  // Yedeklerin yazılacağı dizin (sunucu diski).
  dir: string;
  // Otomatik yedek zamanlaması (cron). Varsayılan: her gün 03:00.
  cron: string;
  // pg_dump/psql ikililerinin bulunduğu dizin (boşsa PATH'ten).
  binDir: string;
  // Diskte tutulacak azami yedek sayısı (eskiler silinir; 0 = sınırsız).
  keep: number;
  // Şifreli yedeğin Telegram'a otomatik gönderim zamanlaması (cron). Varsayılan: saatlik.
  telegramCron: string;
  // Şifreli yedeğin gönderileceği Telegram sohbet kimliği (boşsa owner chat'i).
  telegramChatId: string;
  // Yedek şifreleme (public) anahtarının dosya yolu — API'da tutulur.
  publicKeyFile: string;
  // Yedek şifre çözme (private) anahtarının dosya yolu — web arayüzünde gösterilir.
  privateKeyFile: string;
  // Günlük Telegram yedek mesajının kalıcı durum dosyası (mesaj id, gün, kayıtlar).
  stateFile: string;
}

export interface NotificationsConfig {
  telegramBotToken: string;
  telegramOwnerChatId: string;
  debtReminderCron: string;
  debtReminderThreshold: number;
  // WhatsApp (Meta Cloud API) — boşsa kanal pasif.
  whatsappToken: string;
  whatsappPhoneNumberId: string;
  whatsappApiVersion: string;
}

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  business: BusinessConfig;
  currency: CurrencyConfig;
  scheduler: SchedulerConfig;
  backup: BackupConfig;
  notifications: NotificationsConfig;
}

export default (): RootConfig => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.APP_PORT ?? '3000', 10),
    globalPrefix: process.env.APP_GLOBAL_PREFIX ?? 'api',
    corsOrigin: process.env.APP_CORS_ORIGIN ?? '*',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'stocktrack',
    password: process.env.DB_PASSWORD ?? 'stocktrack',
    database: process.env.DB_NAME ?? 'stocktrack',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'access-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  business: {
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'TRY',
    defaultRatePerM2: parseFloat(process.env.DEFAULT_RATE_PER_M2 ?? '75'),
    defaultWarehouseCode: process.env.DEFAULT_WAREHOUSE_CODE ?? 'MERKEZ',
    name: process.env.BUSINESS_NAME ?? 'StockTrack',
    address: process.env.BUSINESS_ADDRESS ?? '',
    phone: process.env.BUSINESS_PHONE ?? '',
    taxNo: process.env.BUSINESS_TAX_NO ?? '',
    logoPath: process.env.BUSINESS_LOGO_PATH ?? '',
    portalBaseUrl:
      process.env.PORTAL_BASE_URL ?? 'http://localhost:5173/portal',
  },
  currency: {
    base: process.env.EXCHANGE_RATE_BASE ?? process.env.DEFAULT_CURRENCY ?? 'TRY',
    apiUrl: process.env.EXCHANGE_RATE_API_URL ?? '',
    syncCron: process.env.EXCHANGE_RATE_SYNC_CRON ?? '0 6 * * *',
  },
  scheduler: {
    enabled: (process.env.SCHEDULER_ENABLED ?? 'true') === 'true',
  },
  backup: {
    dir: process.env.BACKUP_DIR ?? 'backups',
    cron: process.env.BACKUP_CRON ?? '0 3 * * *',
    binDir: process.env.BACKUP_PG_BIN_DIR ?? '',
    keep: parseInt(process.env.BACKUP_KEEP ?? '14', 10),
    telegramCron: process.env.BACKUP_TELEGRAM_CRON ?? '0 * * * *',
    telegramChatId:
      process.env.BACKUP_TELEGRAM_CHAT_ID ??
      process.env.TELEGRAM_OWNER_CHAT_ID ??
      '',
    publicKeyFile:
      process.env.BACKUP_PUBLIC_KEY_FILE ?? 'backups/backup-key.pub.pem',
    privateKeyFile:
      process.env.BACKUP_PRIVATE_KEY_FILE ?? 'backups/backup-key.priv.pem',
    stateFile:
      process.env.BACKUP_TELEGRAM_STATE_FILE ??
      'backups/telegram-backup-state.json',
  },
  notifications: {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    telegramOwnerChatId: process.env.TELEGRAM_OWNER_CHAT_ID ?? '',
    debtReminderCron: process.env.DEBT_REMINDER_CRON ?? '0 9 * * *',
    debtReminderThreshold: parseFloat(process.env.DEBT_REMINDER_THRESHOLD ?? '0'),
    whatsappToken: process.env.WHATSAPP_TOKEN ?? '',
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    whatsappApiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
  },
});
