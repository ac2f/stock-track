import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { DatabaseConfig } from './configuration';

/**
 * Tek bir kaynaktan hem NestJS runtime (TypeOrmModule) hem de TypeORM CLI
 * (migration) için DataSource ayarları üretir.
 */
export function buildTypeOrmOptions(
  db: DatabaseConfig,
): TypeOrmModuleOptions & DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    // Varlıklar (entities) ve migration'lar derlenmiş ve TS yollarından bulunur.
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: db.synchronize, // sadece geliştirmede true
    logging: db.logging,
    namingStrategy: undefined, // varsayılan snake_case @Column adlarıyla kullanılır
    // Havuz ve zaman aşımları: pg'nin varsayılanları (10 bağlantı, bağlantı beklemede SINIRSIZ,
    // sorgu süresiz) yoğun saatte isteklerin sonsuza dek asılı kalmasına yol açar.
    poolSize: db.poolMax,
    connectTimeoutMS: db.connectTimeoutMs,
    extra: {
      max: db.poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: db.connectTimeoutMs,
      application_name: 'stocktrack-api',
      ...(db.statementTimeoutMs > 0 ? { statement_timeout: db.statementTimeoutMs } : {}),
      ...(db.idleInTransactionTimeoutMs > 0
        ? { idle_in_transaction_session_timeout: db.idleInTransactionTimeoutMs }
        : {}),
    },
  };
}

/** NestJS TypeOrmModule.forRootAsync için fabrika. */
export const typeOrmAsyncConfig = {
  inject: [ConfigService],
  useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
    const db = configService.get<DatabaseConfig>('database');
    if (!db) {
      throw new Error('Database configuration is missing');
    }
    return buildTypeOrmOptions(db);
  },
};

// ── TypeORM CLI için bağımsız DataSource (migration üretimi/çalıştırma) ──
loadEnv();
const cliDb: DatabaseConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'stocktrack',
  password: process.env.DB_PASSWORD ?? 'stocktrack',
  database: process.env.DB_NAME ?? 'stocktrack',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  poolMax: 5,
  connectTimeoutMs: 10000,
  statementTimeoutMs: 0, // CLI/migration uzun sürebilir
  idleInTransactionTimeoutMs: 0,
};

export default new DataSource(buildTypeOrmOptions(cliDb));
