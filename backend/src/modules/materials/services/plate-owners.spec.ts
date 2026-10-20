import { ShopContext } from '../../../common/shop/shop-context';
import { PlatesService } from './plates.service';

/**
 * Stok listesindeki "sahip" süzgeci tüm müşteri listesini çekmek yerine
 * yalnız dükkânda şu an stoğu olan konsinye sahiplerini (GET /plates/owners)
 * önerir.
 */
describe('PlatesService.stockOwners', () => {
  const SHOP = '0f8fad5b-d9cb-469f-a165-70867728950e';

  function build(rows: unknown[]) {
    const dataSource = { query: jest.fn(async () => rows) };
    const config = { get: () => undefined };
    const service = new PlatesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      config as never,
    );
    return { service, dataSource };
  }

  it('dükkâna süzülmüş, stoğu olan sahipleri { id, name } olarak döner', async () => {
    const { service, dataSource } = build([
      { id: 'c1', name: 'Ahmet', extra: 1 },
      { id: 'c2', name: 'Zeynep' },
    ]);
    const owners = await ShopContext.forShop(SHOP, () => service.stockOwners());
    expect(owners).toEqual([
      { id: 'c1', name: 'Ahmet' },
      { id: 'c2', name: 'Zeynep' },
    ]);
    const [sql, params] = dataSource.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([SHOP]);
    expect(sql).toContain('sl.quantity > 0');
    expect(sql).toContain('sl.shop_id = $1');
    expect(sql).toContain('p.deleted_at IS NULL');
  });

  it('dükkân bağlamı yoksa çalışmaz', async () => {
    const { service } = build([]);
    await expect(service.stockOwners()).rejects.toThrow('Dükkân bağlamı yok');
  });
});
