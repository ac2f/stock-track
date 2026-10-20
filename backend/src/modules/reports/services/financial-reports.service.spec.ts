import { ShopContext } from '../../../common/shop/shop-context';
import { FinancialReportsService } from './financial-reports.service';

/**
 * Cari yaşlandırma tek sorguyla yapılır: veritabanı açık (mahsup edilmemiş)
 * borç kalemlerini döner, burada yaşlarına göre kovalanır.
 */
describe('FinancialReportsService.aging', () => {
  const SHOP = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const asOf = new Date('2026-06-30T12:00:00Z');
  const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);

  function build(rows: unknown[]) {
    const ledgerRepo = { query: jest.fn(async () => rows) };
    const service = new FinancialReportsService(
      {} as never,
      ledgerRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, ledgerRepo };
  }

  it('açık borçları yaşına göre kovalar, toplama göre sıralar', async () => {
    const { service, ledgerRepo } = build([
      { customer_id: 'a', customer_name: 'Ali', occurred_at: daysAgo(100), remaining: '50.00' },
      { customer_id: 'a', customer_name: 'Ali', occurred_at: daysAgo(45), remaining: '20.00' },
      { customer_id: 'a', customer_name: 'Ali', occurred_at: daysAgo(5), remaining: '10.50' },
      { customer_id: 'b', customer_name: 'Banu', occurred_at: daysAgo(75).toISOString(), remaining: '300' },
    ]);

    const rows = await ShopContext.forShop(SHOP, () => service.aging(undefined, asOf));

    expect(rows).toEqual([
      { customerId: 'b', customerName: 'Banu', current: 0, days31to60: 0, days61to90: 300, over90: 0, total: 300 },
      { customerId: 'a', customerName: 'Ali', current: 10.5, days31to60: 20, days61to90: 0, over90: 50, total: 80.5 },
    ]);
    // Tek sorgu, dükkân elle süzülür (ham SQL).
    expect(ledgerRepo.query).toHaveBeenCalledTimes(1);
    const [sql, params] = ledgerRepo.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([SHOP]);
    expect(sql).toContain('c.current_balance > 0');
    expect(sql).toContain('e.shop_id = $1');
  });

  it('tek müşteri istenirse kimliğe göre süzer', async () => {
    const { service, ledgerRepo } = build([]);
    const rows = await ShopContext.forShop(SHOP, () => service.aging('cust-1', asOf));
    expect(rows).toEqual([]);
    const [sql, params] = ledgerRepo.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([SHOP, 'cust-1']);
    expect(sql).toContain('c.id = $2');
    expect(sql).not.toContain('c.current_balance > 0');
  });

  it('kuruş altı kalıntıları listelemez', async () => {
    const { service } = build([
      { customer_id: 'a', customer_name: 'Ali', occurred_at: daysAgo(1), remaining: '0.004' },
    ]);
    const rows = await ShopContext.forShop(SHOP, () => service.aging(undefined, asOf));
    expect(rows).toEqual([]);
  });
});
