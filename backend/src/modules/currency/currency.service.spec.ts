import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { CurrencyService } from './currency.service';
import { ExchangeRate } from './entities/exchange-rate.entity';

describe('CurrencyService.convert', () => {
  let service: CurrencyService;

  // 1 USD = 32 TRY, 1 EUR = 35 TRY (baz = TRY).
  const ratesByQuote: Record<string, number> = { USD: 32, EUR: 35 };

  const ratesRepo = {
    findOne: jest.fn(({ where }: { where: { quoteCurrency: string } }) => {
      const rate = ratesByQuote[where.quoteCurrency];
      return Promise.resolve(rate ? ({ rate } as ExchangeRate) : null);
    }),
  } as unknown as Repository<ExchangeRate>;

  const config = {
    get: (key: string) =>
      key === 'currency.base' || key === 'business.defaultCurrency'
        ? 'TRY'
        : undefined,
  } as unknown as ConfigService;

  beforeEach(() => {
    service = new CurrencyService(ratesRepo, config);
  });

  it('aynı para biriminde birebir döner', async () => {
    const r = await service.convert(50, 'TRY', 'TRY');
    expect(r.amount).toBe(50);
    expect(r.rate).toBe(1);
  });

  it('yabancı → baz (USD→TRY)', async () => {
    const r = await service.convert(100, 'USD', 'TRY');
    expect(r.amount).toBe(3200);
  });

  it('baz → yabancı (TRY→USD)', async () => {
    const r = await service.convert(3200, 'TRY', 'USD');
    expect(r.amount).toBe(100);
  });

  it('çapraz (USD→EUR) baz üzerinden', async () => {
    const r = await service.convert(100, 'USD', 'EUR');
    // 100 USD = 3200 TRY = 3200/35 EUR ≈ 91.43
    expect(r.amount).toBeCloseTo(91.43, 2);
  });

  it('toBase yardımcı fonksiyonu baz tutarı verir', async () => {
    expect(await service.toBase(2, 'USD')).toBe(64);
  });
});
