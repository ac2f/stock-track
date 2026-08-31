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

/**
 * Kurların webden otomatik çekilmesi.
 *
 * Sağlayıcılar 1 BAZ birimin kaç döviz ettiğini verir (1 TRY = 0.029 USD);
 * veritabanında bunun TERSİ saklanır (1 USD = 34.48 TRY) — uygulama kurları
 * hep "1 döviz = N TL" yönünde okur.
 *
 * Not: gerçek API bu testlerde ÇAĞRILMAZ; yanıt biçimleri taklit edilir.
 */
describe('CurrencyService.syncFromApi', () => {
  const config = {
    get: (key: string) =>
      key === 'currency.base' || key === 'business.defaultCurrency'
        ? 'TRY'
        : undefined,
  } as unknown as ConfigService;

  function buildService() {
    const saved: { quoteCurrency: string; rate: number; source?: string }[] = [];
    const ratesRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: { quoteCurrency: string; rate: number }) => {
        saved.push(x);
        return x;
      }),
    } as unknown as Repository<ExchangeRate>;
    const service = new CurrencyService(ratesRepo, config);
    return { service, saved };
  }

  /** Sırayla verilen yanıtları döndüren sahte fetch. */
  function mockFetch(responses: (
    | { ok: true; body: unknown }
    | { ok: false; status: number }
    | { throws: string }
  )[]) {
    const queue = [...responses];
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(String(url));
      const next = queue.shift();
      if (!next) throw new Error('beklenmeyen çağrı');
      if ('throws' in next) throw new Error(next.throws);
      if (!next.ok) return { ok: false, status: next.status };
      return { ok: true, json: async () => next.body };
    }) as never;
    return calls;
  }

  it('er-api biçimini okur ve kuru ters çevirerek saklar', async () => {
    const { service, saved } = buildService();
    mockFetch([
      {
        ok: true,
        body: { result: 'success', base_code: 'TRY', rates: { USD: 0.025, EUR: 0.02 } },
      },
    ]);

    const count = await service.syncFromApi();

    expect(count).toBe(2);
    // 1 / 0.025 = 40 TL, 1 / 0.02 = 50 TL
    expect(saved).toEqual([
      expect.objectContaining({ quoteCurrency: 'USD', rate: 40 }),
      expect.objectContaining({ quoteCurrency: 'EUR', rate: 50 }),
    ]);
  });

  it('adreste {BASE} yerine sistemin baz para birimini yazar', async () => {
    const { service } = buildService();
    const calls = mockFetch([
      { ok: true, body: { base: 'TRY', rates: { USD: 0.025 } } },
    ]);

    await service.syncFromApi();

    expect(calls[0]).toContain('/TRY');
    expect(calls[0]).not.toContain('{BASE}');
  });

  it('ilk sağlayıcı düşerse ikinciye geçer', async () => {
    const { service, saved } = buildService();
    const calls = mockFetch([
      { throws: 'ağ hatası' },
      { ok: true, body: { base: 'TRY', rates: { USD: 0.025 } } },
    ]);

    const count = await service.syncFromApi();

    expect(calls).toHaveLength(2);
    expect(count).toBe(1);
    expect(saved).toHaveLength(1);
  });

  it('sağlayıcı beklenen tabanı vermezse kurları YAZMAZ', async () => {
    const { service, saved } = buildService();
    // İki sağlayıcı da yanlış tabanla dönerse hiçbir şey yazılmaz.
    mockFetch([
      { ok: true, body: { base: 'USD', rates: { TRY: 34 } } },
      { ok: true, body: { base: 'USD', rates: { TRY: 34 } } },
    ]);

    const count = await service.syncFromApi();

    expect(count).toBe(0);
    expect(saved).toEqual([]);
  });

  it('hata bildiren yanıtı yok sayar', async () => {
    const { service, saved } = buildService();
    mockFetch([
      { ok: true, body: { result: 'error', 'error-type': 'unsupported-code' } },
      { ok: false, status: 503 },
    ]);

    const count = await service.syncFromApi();

    expect(count).toBe(0);
    expect(saved).toEqual([]);
  });

  it('geçersiz/sıfır kurları atlar, baz para birimini yazmaz', async () => {
    const { service, saved } = buildService();
    mockFetch([
      { ok: true, body: { base: 'TRY', rates: { USD: 0.025, EUR: 0, TRY: 1 } } },
    ]);

    await service.syncFromApi();

    expect(saved.map((s) => s.quoteCurrency)).toEqual(['USD']);
  });

  it('küçük kurlarda hassasiyeti korur (6 ondalık)', async () => {
    const { service, saved } = buildService();
    // 1 TRY = 4.2 JPY → 1 JPY = 0.238095 TRY
    mockFetch([{ ok: true, body: { base: 'TRY', rates: { JPY: 4.2 } } }]);

    await service.syncFromApi();

    expect(saved[0].rate).toBeCloseTo(0.238095, 6);
  });

  it('özel adres verilirse yerleşik sağlayıcılar kullanılmaz', async () => {
    const { service } = buildService();
    const calls = mockFetch([
      { ok: true, body: { base: 'TRY', rates: { USD: 0.025 } } },
    ]);

    await service.syncFromApi('https://ornek.test/kur?base={BASE}');

    expect(calls).toEqual(['https://ornek.test/kur?base=TRY']);
  });
});
