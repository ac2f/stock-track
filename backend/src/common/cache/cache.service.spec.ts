import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

const SHOP = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

function build(redisUrl = '', cacheEnabled = true): CacheService {
  const config = {
    get: (k: string) =>
      k === 'redis' ? { url: redisUrl, prefix: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`, cacheEnabled, connectTimeoutMs: 500 } : undefined,
  } as unknown as ConfigService;
  return new CacheService(config);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Aynı davranış sözleşmesi iki kipte de sınanır: bellek (Redis yok) ve —
 * REDIS_TEST_URL verilmişse — gerçek Redis. Redis'li sınama `REDIS_TEST_URL=
 * redis://:parola@127.0.0.1:6379/0 npx jest cache.service` ile çalışır.
 */
const MODES: [string, string][] = [['bellek', '']];
if (process.env.REDIS_TEST_URL) MODES.push(['Redis', process.env.REDIS_TEST_URL]);

describe.each(MODES)('CacheService (%s)', (_label, url) => {
  let cache: CacheService;
  beforeEach(async () => {
    cache = build(url);
    await cache.onModuleInit();
  });
  afterEach(async () => {
    await cache.flushAll();
    await cache.onModuleDestroy();
  });

  it('ilk okuma yükleyiciyi çalıştırır, ikincisi önbellekten gelir', async () => {
    const loader = jest.fn().mockResolvedValue({ a: 1, d: 'x' });
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, loader)).toEqual({ a: 1, d: 'x' });
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, loader)).toEqual({ a: 1, d: 'x' });
    expect(loader).toHaveBeenCalledTimes(1);
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.byGroup.catalog).toEqual({ hits: 1, misses: 1 });
  });

  it('kapsamlar birbirini görmez: bir dükkânın girdisi diğerine verilmez', async () => {
    await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 'A');
    expect(await cache.wrap(OTHER, 'catalog', 'k', 60, async () => 'B')).toBe('B');
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 'X')).toBe('A');
  });

  it('grubu geçersiz kılmak yalnız o grubu ve o kapsamı siler', async () => {
    await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 1);
    await cache.wrap(SHOP, 'settings', 'k', 60, async () => 2);
    await cache.wrap(OTHER, 'catalog', 'k', 60, async () => 3);
    await cache.invalidate(SHOP, 'catalog');
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 10)).toBe(10);
    expect(await cache.wrap(SHOP, 'settings', 'k', 60, async () => 20)).toBe(2);
    expect(await cache.wrap(OTHER, 'catalog', 'k', 60, async () => 30)).toBe(3);
  });

  it("'*' kapsamı grubun bütün dükkânlarını siler", async () => {
    await cache.wrap(SHOP, 'shop', 'k', 60, async () => 1);
    await cache.wrap(OTHER, 'shop', 'k', 60, async () => 2);
    await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 3);
    await cache.invalidate('*', 'shop');
    expect(await cache.wrap(SHOP, 'shop', 'k', 60, async () => 11)).toBe(11);
    expect(await cache.wrap(OTHER, 'shop', 'k', 60, async () => 22)).toBe(22);
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 33)).toBe(3);
  });

  it('süresi dolan girdi yeniden yüklenir', async () => {
    await cache.wrap(SHOP, 'catalog', 'k', 1, async () => 'eski');
    await sleep(1300);
    expect(await cache.wrap(SHOP, 'catalog', 'k', 1, async () => 'yeni')).toBe('yeni');
  });

  it('aynı anda gelen aynı istekler tek yüklemeye iner (single-flight)', async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      await sleep(60);
      return 'v';
    };
    const out = await Promise.all(Array.from({ length: 8 }, () => cache.wrap(SHOP, 'catalog', 'k', 60, loader)));
    expect(out).toEqual(Array(8).fill('v'));
    expect(calls).toBe(1);
  });

  it('YARIŞ: okuma sürerken grup silinirse eski sonuç önbelleğe YAZILMAZ', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Okuyucu eski veriyi yüklerken (veritabanı yavaş) ...
    const slow = cache.wrap(SHOP, 'catalog', 'k', 60, async () => {
      await gate;
      return 'ESKI';
    });
    await sleep(20);
    // ... yazar commit eder ve grubu siler ...
    await cache.invalidate(SHOP, 'catalog');
    release();
    expect(await slow).toBe('ESKI'); // o isteğin kendisi eski sonucu alır (okuma işlemin öncesindeydi)
    // ... ama sonraki okuyucu eskiyi DEĞİL, güncel veriyi görmeli.
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 'YENI')).toBe('YENI');
  });

  it("YARIŞ: '*' silmesi, hash'i henüz olmayan kapsamdaki süren okumayı da engeller", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = cache.wrap(OTHER, 'shop', 'k', 60, async () => {
      await gate;
      return 'ESKI';
    });
    await sleep(20);
    await cache.invalidate('*', 'shop');
    release();
    await slow;
    expect(await cache.wrap(OTHER, 'shop', 'k', 60, async () => 'YENI')).toBe('YENI');
  });

  it('silmeden SONRA başlayan okuma normal şekilde saklanır', async () => {
    await cache.invalidate(SHOP, 'catalog');
    await sleep(15);
    await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 'taze');
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 'baska')).toBe('taze');
  });

  it('yükleyici hata verirse hata iletilir ve hiçbir şey saklanmaz', async () => {
    await expect(
      cache.wrap(SHOP, 'catalog', 'k', 60, async () => {
        throw new Error('db yok');
      }),
    ).rejects.toThrow('db yok');
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 'sonra')).toBe('sonra');
  });

  it('null saklanır (yokluk da bir sonuçtur), undefined saklanmaz', async () => {
    const nul = jest.fn().mockResolvedValue(null);
    await cache.wrap(SHOP, 'catalog', 'n', 60, nul);
    await cache.wrap(SHOP, 'catalog', 'n', 60, nul);
    expect(nul).toHaveBeenCalledTimes(1);
    const und = jest.fn().mockResolvedValue(undefined);
    await cache.wrap(SHOP, 'catalog', 'u', 60, und);
    await cache.wrap(SHOP, 'catalog', 'u', 60, und);
    expect(und).toHaveBeenCalledTimes(2);
  });

  it('hız sınırı sayacı pencere içinde artar, kalan süreyi bildirir', async () => {
    const a = await cache.hit('login:ip:1.1.1.1', 30);
    const b = await cache.hit('login:ip:1.1.1.1', 30);
    const c = await cache.hit('login:ip:2.2.2.2', 30);
    expect([a.count, b.count, c.count]).toEqual([1, 2, 1]);
    expect(b.retryAfter).toBeGreaterThan(0);
    expect(b.retryAfter).toBeLessThanOrEqual(30);
  });

  it('flushAll bütün girdileri siler', async () => {
    await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 1);
    await cache.wrap(OTHER, 'settings', 'k', 60, async () => 2);
    await cache.flushAll();
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, async () => 9)).toBe(9);
    expect(await cache.wrap(OTHER, 'settings', 'k', 60, async () => 8)).toBe(8);
  });
});

describe('CacheService — kapalı kip', () => {
  it('CACHE_ENABLED=false iken her okuma yükleyiciye gider', async () => {
    const cache = build('', false);
    await cache.onModuleInit();
    const loader = jest.fn().mockResolvedValue(1);
    await cache.wrap(SHOP, 'catalog', 'k', 60, loader);
    await cache.wrap(SHOP, 'catalog', 'k', 60, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.stats().mode).toBe('off');
  });
});

describe('CacheService — Redis çökerse', () => {
  it('bağlanılamayan Redis uygulamayı durdurmaz: okumalar yükleyiciye gider, silme hatırlanır', async () => {
    const cache = build('redis://127.0.0.1:1/0'); // kimsenin dinlemediği port
    await cache.onModuleInit();
    const loader = jest.fn().mockResolvedValue('v');
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, loader)).toBe('v');
    expect(await cache.wrap(SHOP, 'catalog', 'k', 60, loader)).toBe('v');
    expect(loader).toHaveBeenCalledTimes(2);
    await cache.invalidate(SHOP, 'catalog'); // iletilemez
    expect(cache.stats().flushPending).toBe(true);
    expect(await cache.ping()).toBe(false);
    // hız sınırı da çalışmaya devam eder (bellek yedeği)
    expect((await cache.hit('x', 10)).count).toBe(1);
    await cache.onModuleDestroy();
  });
});
