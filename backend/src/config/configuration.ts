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
}

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  business: BusinessConfig;
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
  },
});
