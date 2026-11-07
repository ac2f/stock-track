import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { ShopContext } from '../shop/shop-context';
import { GLOBAL_SCOPE } from './cache.groups';
import { CacheLookup, CacheService } from './cache.service';
import { CACHED_KEY, CachedOptions } from './cached.decorator';

/** Sorgu parametrelerini sıralı ve kararlı bir metne çevirir (?a=1&b=2 ≡ ?b=2&a=1). */
export function canonicalQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  return Object.keys(query)
    .sort()
    .map((k) => {
      const v = query[k];
      const val = Array.isArray(v) ? v.map(String).join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k}=${val}`;
    })
    .join('&');
}

/**
 * `@Cached` işaretli GET uç noktalarının yanıtını saklar. Genel interceptor
 * dizisinde zarf (TransformInterceptor) İÇİNDE durur: saklanan, zarfsız veridir.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || !this.cache.enabled) return next.handle();
    const opts = this.reflector.get<CachedOptions | undefined>(CACHED_KEY, context.getHandler());
    if (!opts) return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      path: string;
      query?: Record<string, unknown>;
      user?: { id?: string };
      headers: Record<string, string | string[] | undefined>;
    }>();
    if (req.method !== 'GET') return next.handle();

    const scope = opts.scope === 'global' ? GLOBAL_SCOPE : ShopContext.shopId();
    if (!scope) return next.handle();
    // Yeniden doğrulama isteyen istemci ("Cache-Control: no-cache") önbelleği atlar.
    const cc = String(req.headers['cache-control'] ?? '');
    const bypass = /no-cache|no-store/i.test(cc);
    const res = http.getResponse<{ setHeader(name: string, value: string): void }>();
    const field = `${req.path}?${canonicalQuery(req.query)}${opts.perUser ? `|u:${req.user?.id ?? ''}` : ''}`;

    const lookup: Promise<CacheLookup<unknown>> = bypass
      ? Promise.resolve({ found: false, startedAt: Date.now() })
      : this.cache.lookup<unknown>(scope, opts.group, field);

    return from(lookup).pipe(
      mergeMap((hit) => {
        if (hit.found) {
          res.setHeader('X-Cache', 'HIT');
          return of(hit.value);
        }
        res.setHeader('X-Cache', 'MISS');
        return next
          .handle()
          .pipe(mergeMap(async (data) => {
            await this.cache.store(scope, opts.group, field, data, opts.ttl, hit.startedAt);
            return data;
          }));
      }),
    );
  }
}
