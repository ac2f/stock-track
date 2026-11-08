import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ShopContext } from '../../common/shop/shop-context';
import { defaultFeatures } from '../../common/shop/shop-features';
import { CorelKeyGuard } from './corel-key.guard';

const SHOP = '00000000-0000-4000-8000-0000000000aa';

function guardFor(opts: { check: 'ok' | 'invalid' | 'disabled'; corel: boolean }) {
  const settings = { resolveCorelKey: jest.fn(async () => ({ check: opts.check, shopId: SHOP })) };
  const access = { featuresOf: jest.fn(async () => ({ ...defaultFeatures(), corel: opts.corel })) };
  return new CorelKeyGuard(settings as never, access as never);
}

const ctx = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

describe('CorelKeyGuard', () => {
  it('doğru anahtar + Corel özelliği açık → dükkân bağlamına girer', async () => {
    await ShopContext.run({}, async () => {
      await expect(guardFor({ check: 'ok', corel: true }).canActivate(ctx({ 'x-api-key': 'k' }))).resolves.toBe(true);
      expect(ShopContext.shopId()).toBe(SHOP);
    });
  });

  it('anahtar geçerli olsa bile sistem sahibi Corel özelliğini kapattıysa reddedilir', async () => {
    await ShopContext.run({}, async () => {
      await expect(guardFor({ check: 'ok', corel: false }).canActivate(ctx({ 'x-api-key': 'k' }))).rejects.toThrow(
        ForbiddenException,
      );
      expect(ShopContext.shopId()).toBeUndefined();
    });
  });

  it('geçersiz ve kapalı entegrasyon 401', async () => {
    await ShopContext.run({}, async () => {
      await expect(guardFor({ check: 'invalid', corel: true }).canActivate(ctx({ 'x-api-key': 'x' }))).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guardFor({ check: 'disabled', corel: true }).canActivate(ctx({}))).rejects.toThrow(UnauthorizedException);
    });
  });
});
