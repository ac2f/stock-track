import type { NextFunction, Request, Response } from 'express';
import { ShopContext } from './shop-context';

/**
 * Her isteği boş bir dükkân bağlamında başlatır. Bağlam isteğin bütün
 * asenkron zinciri boyunca (guard → servis → TypeORM) taşınır; dükkânı
 * guard doğruladıktan sonra yazar.
 */
export function shopContextMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  ShopContext.run({}, () => next());
}
