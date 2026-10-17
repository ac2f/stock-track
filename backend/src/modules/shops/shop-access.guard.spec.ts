import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ShopContext } from '../../common/shop/shop-context';
import { fullPermissions, noPermissions } from '../../common/shop/shop-permissions';
import { ShopAccessGuard } from './shop-access.guard';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

function contextFor(cls: object, handler: unknown, req: Record<string, unknown> = {}) {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

describe('ShopAccessGuard', () => {
  const reflector = new Reflector();

  /**
   * Her uç ya herkese açık, ya dükkânsız, ya da hangi alanın okuma/yazma
   * iznini istediği belli olmalı. Yeni bir rota tanımsız eklenirse bu test
   * kırılır (çalışma anında da reddedilir).
   */
  it('her rotanın bir yetki tanımı var', () => {
    const missing: string[] = [];
    let routes = 0;
    for (const file of controllerFiles(join(__dirname, '..'))) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(file) as Record<string, unknown>;
      for (const exported of Object.values(mod)) {
        if (typeof exported !== 'function') continue;
        if (Reflect.getMetadata(PATH_METADATA, exported) === undefined) continue;
        const proto = (exported as { prototype: Record<string, unknown> }).prototype;
        for (const key of Object.getOwnPropertyNames(proto)) {
          const handler = proto[key];
          if (key === 'constructor' || typeof handler !== 'function') continue;
          const method = Reflect.getMetadata(METHOD_METADATA, handler);
          if (method === undefined) continue;
          routes += 1;
          try {
            ShopAccessGuard.required(reflector, contextFor(exported, handler), METHODS[method]);
          } catch (err) {
            if (err instanceof ForbiddenException) missing.push(`${exported.name}.${key}`);
            else throw err;
          }
        }
      }
    }
    expect(routes).toBeGreaterThan(150);
    expect(missing).toEqual([]);
  });

  describe('izin denetimi', () => {
    const SHOP = '00000000-0000-4000-8000-0000000000aa';

    class Probe {
      list() {}
      create() {}
    }
    Reflect.defineMetadata('shop:scope', 'quotes', Probe);

    function guardWith(permissions = noPermissions()) {
      const access = {
        resolve: jest.fn(async () => ({
          shopId: SHOP,
          shopName: 'Test',
          shopActive: true,
          isOwner: false,
          isAdmin: false,
          permissions,
        })),
        implicitShopId: jest.fn(async () => SHOP),
      };
      return { guard: new ShopAccessGuard(reflector, access as never), access };
    }

    const run = (guard: ShopAccessGuard, method: string, handler: unknown) => {
      const req = { method, user: { id: 'u1', role: 'employee' }, headers: { 'x-shop-id': SHOP } };
      return ShopContext.run({}, async () => {
        const result = await guard.canActivate(contextFor(Probe, handler, req));
        return { result, shopId: ShopContext.shopId() };
      });
    };

    it('GET okuma, diğerleri yazma ister', async () => {
      const readOnly = noPermissions();
      readOnly.quotes = { read: true, write: false };
      const { guard } = guardWith(readOnly);
      await expect(run(guard, 'GET', Probe.prototype.list)).resolves.toEqual({ result: true, shopId: SHOP });
      await expect(run(guard, 'POST', Probe.prototype.create)).rejects.toThrow('değiştirme yetkiniz yok');
    });

    it('okuma ve yazma birbirinden bağımsızdır', async () => {
      const writeOnly = noPermissions();
      writeOnly.quotes = { read: false, write: true };
      const { guard } = guardWith(writeOnly);
      await expect(run(guard, 'GET', Probe.prototype.list)).rejects.toThrow('görme yetkiniz yok');
      await expect(run(guard, 'POST', Probe.prototype.create)).resolves.toMatchObject({ result: true });
    });

    it('başka alanın izni yetmez', async () => {
      const other = fullPermissions();
      other.quotes = { read: false, write: false };
      const { guard } = guardWith(other);
      await expect(run(guard, 'GET', Probe.prototype.list)).rejects.toThrow(ForbiddenException);
    });
  });
});
