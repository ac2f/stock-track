import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Yarım kalmış (sunucu çökmüş) bir işlemin anahtarı bu süreden sonra yeniden kullanılabilir. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

export type BeginResult =
  | { kind: 'new' }
  | { kind: 'replay'; statusCode: number; body: unknown }
  | { kind: 'busy' }
  | { kind: 'foreign' };

/**
 * Tekrar güvenli yazma istekleri. Anahtar başına tek satır; ilk gelen istek
 * satırı "işleniyor" olarak alır, bitince yanıtı saklar. Ham SQL kullanılır:
 * "yoksa ekle" tek adımda ve yarışsız olmalı.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly ttlDays: number;
  private readonly schedulerEnabled: boolean;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.ttlDays = Math.max(1, Number(process.env.IDEMPOTENCY_TTL_DAYS) || 14);
    this.schedulerEnabled = configService.get<boolean>('scheduler.enabled') ?? true;
  }

  async begin(
    key: string,
    who: { userId: string | null; shopId: string | null; method: string; path: string },
  ): Promise<BeginResult> {
    const inserted: { key: string }[] = await this.dataSource.query(
      `INSERT INTO "idempotency_keys" ("key", "user_id", "shop_id", "method", "path", "state")
       VALUES ($1, $2, $3, $4, $5, 'processing')
       ON CONFLICT ("key") DO NOTHING RETURNING "key"`,
      [key, who.userId, who.shopId, who.method, who.path.slice(0, 300)],
    );
    if (inserted.length) return { kind: 'new' };

    const rows: {
      user_id: string | null;
      state: string;
      status_code: number | null;
      body: unknown;
      created_at: Date;
    }[] = await this.dataSource.query(
      `SELECT "user_id", "state", "status_code", "body", "created_at" FROM "idempotency_keys" WHERE "key" = $1`,
      [key],
    );
    const row = rows[0];
    if (!row) return this.begin(key, who); // arada silindi: yeniden dene
    if (row.user_id !== who.userId) return { kind: 'foreign' };
    if (row.state === 'done') {
      return { kind: 'replay', statusCode: row.status_code ?? 200, body: row.body };
    }
    // İşleniyor: çok eskiyse önceki deneme yarım kalmıştır, devral.
    if (Date.now() - new Date(row.created_at).getTime() > STALE_PROCESSING_MS) {
      const taken: unknown[] = await this.dataSource.query(
        `UPDATE "idempotency_keys" SET "created_at" = now()
          WHERE "key" = $1 AND "state" = 'processing' AND "created_at" = $2 RETURNING "key"`,
        [key, row.created_at],
      );
      if (taken.length) return { kind: 'new' };
    }
    return { kind: 'busy' };
  }

  async finish(key: string, statusCode: number, body: unknown): Promise<void> {
    await this.dataSource.query(
      `UPDATE "idempotency_keys" SET "state" = 'done', "status_code" = $2, "body" = $3 WHERE "key" = $1`,
      [key, statusCode, JSON.stringify(body ?? null)],
    );
  }

  /** İşlem hata verdi: anahtar serbest kalır, istemci yeniden deneyebilir. */
  async abandon(key: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM "idempotency_keys" WHERE "key" = $1`, [key]);
  }

  /**
   * Çöp temizliği: süresi geçmiş yanıtlar ve yarım kalmış işlemler silinir.
   * Bir cihaz bu süreden uzun çevrimdışı kalırsa kuyruğu yine gönderilir;
   * yalnız tekrar korumasının penceresi kapanmış olur.
   */
  @Cron(process.env.IDEMPOTENCY_CLEANUP_CRON || '30 4 * * *')
  async scheduledCleanup(): Promise<void> {
    if (!this.schedulerEnabled) return;
    await this.cleanup();
  }

  async cleanup(): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `DELETE FROM "idempotency_keys"
        WHERE ("state" = 'done' AND "created_at" < now() - make_interval(days => $1))
           OR ("state" = 'processing' AND "created_at" < now() - interval '1 hour')`,
      [this.ttlDays],
    );
    const removed = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
    if (removed) this.logger.log(`Tekrar koruması: ${removed} eski kayıt silindi.`);
    return removed;
  }
}
