import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { from, Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { DataSource } from 'typeorm';
import { ShopContext } from '../../common/shop/shop-context';
import { encodeHeaderJson, REPLAY_RESULT_HEADER } from './sync-replay.secret';
import { shouldJournal, syncRouteInfo } from './sync-request';

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
/** Ajanın duraklatması en çok bu kadar beklenir. */
const PAUSE_WAIT_MS = 20_000;

/**
 * Eşitlemenin istek tarafı (docs/SYNC.md):
 *
 *  - MERKEZ, iç yeniden oynatma isteği: işlem bitince açılan kayıtları ve
 *    belge numaralarını `X-Sync-Created` başlığıyla döner (push yanıtına girer).
 *  - YEREL SUNUCU: yerelde başarıyla yapılan her yazma isteğini giden kutusuna
 *    (replica_outbox) asıl haliyle yazar. Önce "işleniyor" olarak açılır,
 *    başarıyla biterse "gönderilecek" olur, hata olursa silinir (yerelde de
 *    olmamıştır). Süreç arada çökerse açılışta "belirsiz" olur, kişi karar verir.
 *
 * Tekrar korumasının İÇİNDE çalışır: aynı anahtarla tekrar gelen istek giden
 * kutusuna ikinci kez girmez.
 */
@Injectable()
export class SyncInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SyncInterceptor.name);
  private readonly role: 'primary' | 'replica';
  private readonly prefix: string;

  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.role = config.get<'primary' | 'replica'>('sync.role') ?? 'primary';
    this.prefix = `/${(config.get<string>('app.globalPrefix') ?? 'api').replace(/^\/+|\/+$/g, '')}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    const store = ShopContext.current();

    if (store?.sync?.replay) {
      return next.handle().pipe(
        mergeMap(async (body) => {
          const capture = store.sync?.capture;
          if (capture && !res.headersSent) {
            res.setHeader(REPLAY_RESULT_HEADER, encodeHeaderJson(capture));
          }
          return body;
        }),
      );
    }

    if (this.role !== 'replica' || !store) return next.handle();
    if (!shouldJournal(syncRouteInfo(this.reflector, context, req.method))) return next.handle();

    const header = req.headers['idempotency-key'];
    const key = (Array.isArray(header) ? header[0] : header)?.trim();
    const opId = key && KEY_RE.test(key) ? key : randomUUID();
    const path = this.relativePath(req.originalUrl ?? req.url);
    const actor: 'user' | 'corel' = req.user?.id ? 'user' : 'corel';

    return from(
      this.open(opId, [
        opId,
        actor,
        req.user?.id ?? null,
        store.shopId ?? null,
        req.method,
        path.slice(0, 500),
        JSON.stringify(req.body ?? null),
      ]),
    ).pipe(
      mergeMap((rows: { seq: string }[]) => {
        // Aynı kimlikle kayıt zaten var (tekrar koruması dışı yeniden deneme):
        // ikinci kez yazılmaz, istek yine de işlenir.
        if (!rows.length) return next.handle();
        store.sync = { capture: { inserted: [], docNos: {} } };
        return next.handle().pipe(
          mergeMap(async (body) => {
            const capture = store.sync?.capture;
            await this.dataSource.query(
              `UPDATE replica_outbox
                  SET state = 'pending', local_status = $2, created_ids = $3, doc_nos = $4, updated_at = now()
                WHERE id = $1`,
              [
                opId,
                res.statusCode,
                JSON.stringify(capture?.inserted ?? []),
                JSON.stringify(capture?.docNos ?? {}),
              ],
            );
            return body;
          }),
          catchError((err) =>
            from(
              this.dataSource
                .query(`DELETE FROM replica_outbox WHERE id = $1 AND state = 'executing'`, [opId])
                .catch((e: Error) => this.logger.warn(`Giden kutusu temizlenemedi: ${e.message}`)),
            ).pipe(mergeMap(() => throwError(() => err))),
          ),
        );
      }),
    );
  }

  /**
   * Giden kutusuna "işleniyor" satırını açar. Ajan yazmaları duraklattıysa
   * (replica_state.writes_paused_until) kalkmasını bekler — ekleme ve
   * duraklatma denetimi tek komuttur, araya yazma giremez. Uzun sürerse 503.
   */
  private async open(opId: string, params: unknown[]): Promise<{ seq: string }[]> {
    const deadline = Date.now() + PAUSE_WAIT_MS;
    for (;;) {
      const rows: { seq: string }[] = await this.dataSource.query(
        `INSERT INTO replica_outbox (id, state, actor, user_id, shop_id, method, path, body, occurred_at)
         SELECT $1, 'executing', $2, $3, $4, $5, $6, $7, now()
          WHERE NOT EXISTS (SELECT 1 FROM replica_state WHERE id = 1 AND writes_paused_until > now())
         ON CONFLICT (id) DO NOTHING RETURNING seq`,
        params,
      );
      if (rows.length) return rows;
      const [{ paused }] = await this.dataSource.query(
        `SELECT EXISTS (SELECT 1 FROM replica_state WHERE id = 1 AND writes_paused_until > now()) AS paused`,
      );
      if (!paused) return []; // aynı kimlik zaten var
      if (Date.now() > deadline) {
        throw new ServiceUnavailableException(
          'Yerel sunucu merkezle eşitleniyor; birkaç saniye sonra yeniden deneyin.',
        );
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  /** `/api/v1/sales?x=1` → `/v1/sales?x=1` */
  private relativePath(url: string): string {
    return url.startsWith(this.prefix + '/') ? url.slice(this.prefix.length) : url;
  }
}
