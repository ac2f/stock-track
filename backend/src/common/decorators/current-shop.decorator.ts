import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * ShopAccessGuard'ın çözdüğü dükkân erişimi (dükkân, yönetici mi, izinler).
 *
 *   @Get() list(@CurrentShop() shop: ShopAccessInfo) { ... }
 */
export const CurrentShop = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().shopAccess,
);
