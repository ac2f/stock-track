import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CacheService } from './cache.service';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Pencere başına izin verilen en çok istek. */
  limit: number;
  windowSeconds: number;
  /** Sayacın kimliği: istemci IP'si (varsayılan), oturumdaki kullanıcı ya da hiçbiri (yalnız bodyField). */
  by?: 'ip' | 'user' | 'none';
  /** Gövdedeki bu alanı da anahtara kat (ör. giriş denemesinde e-posta). */
  bodyField?: string;
  /** Aynı sınırı paylaşan uç noktalar için ortak ad (varsayılan: sınıf.yöntem). */
  name?: string;
  message?: string;
}

/**
 * Uç noktaya bir ya da birkaç istek sınırı koyar (Redis'te paylaşılır, yoksa
 * süreç içi). Hepsi sağlanmalıdır; biri aşılırsa 429 döner.
 */
export const RateLimit = (...rules: RateLimitOptions[]) => SetMetadata(RATE_LIMIT_KEY, rules);

/**
 * `@RateLimit` işaretli uç noktalar için sabit pencereli sınır. Aşılırsa
 * 429 ve `Retry-After` döner. Sayaç Redis'te olduğundan birden çok API
 * kopyası aynı sınırı paylaşır.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const rules = this.reflector.get<RateLimitOptions[] | undefined>(RATE_LIMIT_KEY, context.getHandler());
    if (!rules?.length) return true;
    const http = context.switchToHttp();
    const req = http.getRequest<{
      ip?: string;
      user?: { id?: string };
      body?: Record<string, unknown>;
    }>();

    for (const [i, opts] of rules.entries()) {
      const by = opts.by ?? 'ip';
      const who = by === 'user' ? `u:${req.user?.id ?? req.ip ?? '?'}` : by === 'ip' ? `ip:${req.ip ?? '?'}` : 'all';
      let extra = '';
      if (opts.bodyField) {
        const v = req.body?.[opts.bodyField];
        if (typeof v === 'string' && v.trim()) extra = `:${v.trim().toLowerCase().slice(0, 120)}`;
      }
      const name = opts.name ?? `${context.getClass().name}.${context.getHandler().name}.${i}`;
      const { count, retryAfter } = await this.cache.hit(`${name}:${who}${extra}`, opts.windowSeconds);
      if (count > opts.limit) {
        http.getResponse<{ setHeader(n: string, v: string): void }>().setHeader('Retry-After', String(retryAfter));
        throw new HttpException(
          opts.message ?? `Çok fazla deneme. ${retryAfter} saniye sonra tekrar deneyin.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}
