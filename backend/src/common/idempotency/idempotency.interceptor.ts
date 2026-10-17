import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { ShopContext } from '../shop/shop-context';
import { IdempotencyService } from './idempotency.service';

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * `Idempotency-Key` başlığı taşıyan yazma isteklerini bir kez işler.
 * Global ve EN DIŞTAKİ interceptor'dır: saklanan yanıt, istemcinin gördüğü
 * zarflı gövdenin kendisidir; tekrarında aynen döner. Guard'lardan sonra
 * çalışır: anahtar kullanıcıya bağlanır, başkasının anahtarı tekrar edilemez.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    if (SAFE_METHODS.has(req.method)) return next.handle();
    const header = req.headers['idempotency-key'];
    const key = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!key) return next.handle();
    if (!KEY_RE.test(key)) {
      return throwError(() => new BadRequestException('Geçersiz Idempotency-Key.'));
    }

    const who = {
      userId: req.user?.id ?? null,
      shopId: ShopContext.shopId() ?? null,
      method: req.method,
      path: req.originalUrl ?? req.url,
    };
    return from(this.store.begin(key, who)).pipe(
      mergeMap((begun) => {
        switch (begun.kind) {
          case 'replay':
            res.setHeader('Idempotent-Replay', 'true');
            return of(begun.body);
          case 'busy':
            throw new ConflictException('Bu işlem şu anda işleniyor; birazdan yeniden deneyin.');
          case 'foreign':
            throw new ConflictException('Bu işlem anahtarı başka bir oturuma ait.');
          default:
            return next.handle().pipe(
              mergeMap(async (body) => {
                // Gövdeyi kendisi yazan uçlar (@Res) için saklanacak yanıt yok.
                if (body === undefined) await this.store.abandon(key);
                else await this.store.finish(key, res.statusCode, body);
                return body;
              }),
              catchError((err) =>
                from(this.store.abandon(key)).pipe(mergeMap(() => throwError(() => err))),
              ),
            );
        }
      }),
    );
  }
}
