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
});
