import * as Joi from 'joi';

/**
 * .env şema doğrulaması. Uygulama, eksik/yanlış bir ortam değişkeniyle
 * başlatılmaya çalışılırsa açılışta (fail-fast) hata verir.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  APP_PORT: Joi.number().default(3000),
  APP_GLOBAL_PREFIX: Joi.string().default('api'),
  APP_CORS_ORIGIN: Joi.string().default('*'),

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

  // Bildirim (Telegram opsiyonel; boşsa yalnızca Log kanalı)
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  TELEGRAM_OWNER_CHAT_ID: Joi.string().allow('').optional(),
  DEBT_REMINDER_CRON: Joi.string().default('0 9 * * *'),
  DEBT_REMINDER_THRESHOLD: Joi.number().min(0).default(0),

  // WhatsApp (Meta Cloud API; boşsa kanal pasif — Log daima çalışır)
  WHATSAPP_TOKEN: Joi.string().allow('').optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').optional(),
  WHATSAPP_API_VERSION: Joi.string().default('v21.0'),
});
