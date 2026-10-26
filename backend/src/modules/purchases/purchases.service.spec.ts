import { IsNull } from 'typeorm';
import { PurchasesService } from './purchases.service';

/**
 * Alım geçmişi: tükenip stoktan düşen (soft-delete) malzemenin adı geçmiş
 * alımda görünmeye devam eder, silinmiş alımlar listelenmez.
 */
describe('PurchasesService.findAll', () => {
  function build() {
    const ordersRepo = { findAndCount: jest.fn(async () => [[], 0]) };
    const service = new PurchasesService(
      ordersRepo as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );
    return { service, ordersRepo };
  }

  const query = (extra = {}) => ({ page: 1, limit: 20, skip: 0, ...extra }) as never;

  it('silinmiş plakayı yükler, silinmiş alımı dışarıda bırakır', async () => {
    const { service, ordersRepo } = build();
    await service.findAll(query());
    const args = (ordersRepo.findAndCount.mock.calls as unknown as Record<string, unknown>[][])[0][0];
    expect(args.withDeleted).toBe(true);
    expect((args.where as Record<string, unknown>).deletedAt).toEqual(IsNull());
    expect(args.relations).toEqual({ supplier: true, items: { plate: true } });
  });

  it('tedarikçi süzgeci silinmiş alım koşulunu bozmaz', async () => {
    const { service, ordersRepo } = build();
    await service.findAll(query({ supplierId: 's1' }));
    const args = (ordersRepo.findAndCount.mock.calls as unknown as Record<string, unknown>[][])[0][0];
    expect(args.where).toMatchObject({ supplierId: 's1', deletedAt: IsNull() });
  });
});
