import { CanActivate, ConflictException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { rejectOnReplica, syncRouteInfo } from './sync-request';

/**
 * Yerel sunucuda (SYNC_ROLE=replica) yalnız merkezde yapılabilen işlemleri
 * durdurur: ekip/dükkân/kullanıcı yönetimi, yedek, anahtar üretimi, sistem
 * ayarları ... Bunlar merkeze bağlanınca orada yapılır.
 */
export class PrimaryOnlyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly role: 'primary' | 'replica',
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.role !== 'replica' || context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (rejectOnReplica(syncRouteInfo(this.reflector, context, req.method))) {
      throw new ConflictException(
        'Bu işlem yalnız merkez sunucuda yapılabilir (şu an yerel sunucuya bağlısınız).',
      );
    }
    return true;
  }
}
