import * as Joi from 'joi';

/**
 * .env şema doğrulaması. Uygulama, eksik/yanlış bir ortam değişkeniyle
 * başlatılmaya çalışılırsa açılışta (fail-fast) hata verir.
 */
/** Örnek/öntanımlı değerler: üretimde asla sır olarak kullanılmamalı. */
const PLACEHOLDER = /change[-_ ]?me|access-secret|refresh-secret|secret123|example|changeit|password|^(test|dev|default)/i;

/**
 * Üretimde (NODE_ENV=production) JWT sırları: en az 32 karakter, örnek değer olmayan ve birbirinden farklı.
 * Zayıf sır, herkesin geçerli oturum belgesi üretebilmesi demektir; bu yüzden uygulama AÇILMAZ (fail-fast).
 * Kurulum betikleri (install.sh/install.ps1) 64 karakterlik rastgele sır üretir.
 */
function productionChecks(env: Record<string, unknown>, helpers: Joi.CustomHelpers) {
  if (env.NODE_ENV !== 'production') return env;
  const problems: string[] = [];
  const a = String(env.JWT_ACCESS_SECRET ?? '');
  const r = String(env.JWT_REFRESH_SECRET ?? '');
  for (const [name, v] of [['JWT_ACCESS_SECRET', a], ['JWT_REFRESH_SECRET', r]] as const) {
    if (v.length < 32) problems.push(`${name} en az 32 karakter olmalı (şu an ${v.length}).`);
    else if (PLACEHOLDER.test(v)) problems.push(`${name} örnek/öntanımlı bir değer; rastgele bir sır üretin (openssl rand -hex 32).`);
  }
  if (a && a === r) problems.push('JWT_ACCESS_SECRET ve JWT_REFRESH_SECRET aynı olamaz.');
  if (problems.length) return helpers.message({ custom: `Üretim yapılandırması güvensiz: ${problems.join(' ')}` });
  // Kapıyı açık bırakmayan ama dikkat çekilmesi gerekenler (açılışı engellemez).
  const warn: string[] = [];
  if (['stocktrack', 'postgres', 'password'].includes(String(env.DB_PASSWORD))) warn.push('DB_PASSWORD öntanımlı/zayıf.');
  if (String(env.APP_CORS_ORIGIN ?? '*') === '*') warn.push('APP_CORS_ORIGIN=* (her kaynaktan tarayıcı erişimi); arayüz API ile aynı kaynaktan sunuluyorsa kısıtlayın.');
  if (env.DB_SYNCHRONIZE === true || env.DB_SYNCHRONIZE === 'true') warn.push('DB_SYNCHRONIZE=true: şema açılışta eşitlenir (yükseltme öncesi yedek PRE_UPGRADE_BACKUP ile alınır).');
  for (const w of warn) console.warn(`[uyarı] ${w}`);
  return env;
}

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  APP_PORT: Joi.number().default(3000),
  APP_GLOBAL_PREFIX: Joi.string().default('api'),
  APP_CORS_ORIGIN: Joi.string().default('*'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(1),

  // Redis: boşsa süreç içi bellek önbelleği (bkz. common/cache)
  REDIS_URL: Joi.string().allow('').optional(),
  REDIS_PREFIX: Joi.string().default('st'),
  CACHE_ENABLED: Joi.boolean().default(true),
  REDIS_CONNECT_TIMEOUT_MS: Joi.number().min(200).default(2000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(8).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(8).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  DEFAULT_CURRENCY: Joi.string().length(3).default('TRY'),
  DEFAULT_RATE_PER_M2: Joi.number().positive().default(75),
  DEFAULT_WAREHOUSE_CODE: Joi.string().default('MERKEZ'),

  // İşletme / belge kimliği (PDF fatura/irsaliye/teklif) + portal linki
  BUSINESS_NAME: Joi.string().allow('').optional(),
  BUSINESS_ADDRESS: Joi.string().allow('').optional(),
  BUSINESS_PHONE: Joi.string().allow('').optional(),
  BUSINESS_TAX_NO: Joi.string().allow('').optional(),
  BUSINESS_LOGO_PATH: Joi.string().allow('').optional(),
  PORTAL_BASE_URL: Joi.string().allow('').optional(),

  // Döviz
  EXCHANGE_RATE_BASE: Joi.string().length(3).optional(),
  EXCHANGE_RATE_API_URL: Joi.string().allow('').optional(),
  EXCHANGE_RATE_SYNC_CRON: Joi.string().default('0 6 * * *'),

  // Zamanlayıcı (cluster'da tek replikada açık tutulur)
  SCHEDULER_ENABLED: Joi.boolean().default(true),

  // Merkez/yerel sunucu eşitlemesi (docs/SYNC.md)
  SYNC_ROLE: Joi.string().valid('primary', 'replica').default('primary'),
  SYNC_RETENTION_DAYS: Joi.number().min(1).default(30),
  SYNC_GAP_WAIT_SECONDS: Joi.number().min(5).default(60),

  // Veritabanı yedekleme
  BACKUP_DIR: Joi.string().default('backups'),
  BACKUP_CRON: Joi.string().default('0 3 * * *'),
  BACKUP_PG_BIN_DIR: Joi.string().allow('').optional(),
  BACKUP_KEEP: Joi.number().min(0).default(14),

  // Şifreli yedeğin Telegram'a gönderimi
  BACKUP_TELEGRAM_CRON: Joi.string().default('0 * * * *'),
  BACKUP_TELEGRAM_CHAT_ID: Joi.string().allow('').optional(),
  BACKUP_PUBLIC_KEY_FILE: Joi.string().allow('').optional(),
  BACKUP_PRIVATE_KEY_FILE: Joi.string().allow('').optional(),
  BACKUP_TELEGRAM_STATE_FILE: Joi.string().allow('').optional(),

  // Bildirim (Telegram opsiyonel; boşsa yalnızca Log kanalı)
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  TELEGRAM_OWNER_CHAT_ID: Joi.string().allow('').optional(),
  DEBT_REMINDER_CRON: Joi.string().default('0 9 * * *'),
  DEBT_REMINDER_THRESHOLD: Joi.number().min(0).default(0),

  // WhatsApp (Meta Cloud API; boşsa kanal pasif — Log daima çalışır)
  WHATSAPP_TOKEN: Joi.string().allow('').optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').optional(),
  WHATSAPP_API_VERSION: Joi.string().default('v21.0'),

  // Veritabanı bağlantı havuzu ve zaman aşımları (bkz. config/typeorm.config.ts)
  DB_POOL_MAX: Joi.number().integer().min(2).max(200).default(20),
  DB_CONNECT_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  DB_STATEMENT_TIMEOUT_MS: Joi.number().integer().min(0).default(120000),
  DB_IDLE_TX_TIMEOUT_MS: Joi.number().integer().min(0).default(120000),
}).unknown(true).custom(productionChecks);
