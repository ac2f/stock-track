import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  ANY_SHOP_MEMBER_KEY,
  NO_SHOP_KEY,
  SHOP_ACCESS_KEY,
  SHOP_SCOPE_KEY,
} from '../../common/shop/shop-access.decorator';
import { ShopContext } from '../../common/shop/shop-context';
import {
  AccessLevel,
  can,
  SHOP_MODULE_LABELS,
  ShopModule,
} from '../../common/shop/shop-permissions';
import { ShopAccessInfo, ShopAccessService } from './shop-access.service';

/** Bir rotanın istediği erişim. `module` yoksa dükkân üyeliği yeterlidir. */
export interface RequiredShopAccess {
  module?: ShopModule;
  level?: AccessLevel;
}

export type ShopRequest = Request & {
  user?: AuthenticatedUser;
  shopAccess?: ShopAccessInfo;
};

/**
 * Global dükkân koruması (JWT ve rol korumasından sonra çalışır):
 *  1. İstek hangi dükkân için? → `X-Shop-Id` başlığı (yoksa kullanıcının tek dükkânı)
 *  2. Kullanıcı o dükkânın üyesi mi? (sistem sahibi her yere girer)
 *  3. Rotanın alanı için okuma/yazma izni var mı?
 *  4. Dükkânı istek bağlamına yazar → veritabanı sorguları o dükkâna süzülür.
 *
 * Yetki tanımı OLMAYAN rota reddedilir (unutulan rota açık kalmasın).
 */
@Injectable()
export class ShopAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: ShopAccessService,
  ) {}

  /** Rota için gereken erişim; `null` → dükkân gerekmez. */
  static required(reflector: Reflector, context: ExecutionContext, method: string): RequiredShopAccess | null {
    const handler = context.getHandler();
    const cls = context.getClass();
    if (reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, cls])) return null;

    // Rotadaki tanım sınıftakini ezer (ör. dükkânsız bir controller'da
    // dükkân isteyen tek bir rota).
    const explicit = reflector.get<RequiredShopAccess>(SHOP_ACCESS_KEY, handler);
    if (explicit) return explicit;
    if (reflector.get<boolean>(ANY_SHOP_MEMBER_KEY, handler)) return {};
    if (reflector.get<boolean>(NO_SHOP_KEY, handler)) return null;
    const read = method === 'GET' || method === 'HEAD';
    const level: AccessLevel = read ? 'read' : 'write';
    const methodModule = reflector.get<ShopModule>(SHOP_SCOPE_KEY, handler);
    if (methodModule) return { module: methodModule, level };

    if (reflector.get<boolean>(NO_SHOP_KEY, cls)) return null;
    const classModule = reflector.get<ShopModule>(SHOP_SCOPE_KEY, cls);
    if (classModule) return { module: classModule, level };
    if (reflector.get<boolean>(ANY_SHOP_MEMBER_KEY, cls)) return {};
    throw new ForbiddenException('Bu işlem için yetki tanımı yapılmamış.');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<ShopRequest>();
    const required = ShopAccessGuard.required(this.reflector, context, req.method);
    if (!required) return true;

    const user = req.user;
    if (!user) throw new UnauthorizedException();

    const header = req.headers['x-shop-id'];
    const requested = Array.isArray(header) ? header[0] : header;
    const shopId = requested?.trim() || (await this.access.implicitShopId(user));
    const info = await this.access.resolve(user, shopId);

    if (required.module && required.level) {
      if (!can(info.permissions, required.module, required.level)) {
        const what = required.level === 'read' ? 'görme' : 'değiştirme';
        throw new ForbiddenException(
          `"${SHOP_MODULE_LABELS[required.module]}" alanında ${what} yetkiniz yok (${info.shopName}).`,
        );
      }
    }

    ShopContext.enter(info.shopId, user.id);
    req.shopAccess = info;
    return true;
  }
}
