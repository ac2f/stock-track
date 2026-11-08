import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig } from '../../config/configuration';

export type CacheMode = 'redis' | 'memory' | 'off';

export interface CacheStats {
  mode: CacheMode;
  /** Redis'e şu an ulaşılabiliyor mu (bellek kipinde hep true). */
  ready: boolean;
  hits: number;
  misses: number;
  writes: number;
  invalidations: number;
  errors: number;
  /** Önbellek geçersiz kılınırken Redis'e ulaşılamadı: bağlantı gelince tümü silinecek. */
  flushPending: boolean;
  byGroup: Record<string, { hits: number; misses: number }>;
}

/** Bir `lookup` sonucu: bulundu mu, değer, okuma başlangıç anı (yazarken yarış denetimi için). */
export interface CacheLookup<T> {
  found: boolean;
  value?: T;
  startedAt: number;
}

/** Tek bir girdinin en büyük boyutu (JSON karakteri): devasa yanıtlar saklanmaz. */
const MAX_ENTRY_CHARS = 1_000_000;
/** Bellek kipinde grup başına en çok girdi. */
const MEM_MAX_FIELDS = 2000;
/**
 * Geçersiz kılma işareti (tombstone) bu kadar saniye yaşar: bundan uzun süren
 * bir okuma-yazma yarışı olmaz. Okuma, işaretten ÖNCE başladıysa sonucunu
 * yazamaz (eski veri önbelleğe girmesin).
 */
const TOMBSTONE_SECONDS = 30;
/** Başlangıç anı ile işaret arasındaki saat farkı payı (ms). */
const CLOCK_SKEW_MS = 5;

/** Alana yazar, yalnız bu okumadan SONRA bir geçersiz kılma yoksa. */
const LUA_SET_FRESH = `
local limit = tonumber(ARGV[3]) - tonumber(ARGV[5])
local tomb = redis.call('GET', KEYS[2])
if tomb and tonumber(tomb) >= limit then return 0 end
local all = redis.call('GET', KEYS[3])
if all and tonumber(all) >= limit then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
local cur = redis.call('TTL', KEYS[1])
if cur < tonumber(ARGV[4]) then redis.call('EXPIRE', KEYS[1], ARGV[4]) end
return 1
`;

/** Grubu siler ve işareti bırakır. */
const LUA_INVALIDATE = `
redis.call('UNLINK', KEYS[1])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1
`;

/** Sabit pencereli sayaç: ilk artışta süre konur. [sayı, kalan sn] döner. */
const LUA_HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {n, ttl}
`;

interface MemEntry {
  expiresAt: number;
  value: string;
}

/**
 * Önbellek: Redis (varsa) ya da süreç içi bellek.
 *
 * YAPI. Her (kapsam, grup) çifti Redis'te TEK bir hash'tir; alanlar istek
 * anahtarlarıdır. Okuma tek gidiş-dönüş (HGET); bir gruba yazılınca hash
 * topluca silinir (UNLINK) — anahtar taraması yok. Girdinin son kullanma
 * zamanı değerin içinde taşınır (Redis'te alan başına süre yok); hash'in
 * kendisi en uzun girdi süresi kadar yaşar.
 *
 * TUTARLILIK. Geçersiz kılma veritabanı katmanından kendiliğinden gelir
 * (cache-invalidation.ts): uygulamanın yaptığı HER yazma, işlem
 * tamamlandıktan sonra ilgili grupları siler. Okuma-yazma yarışı için her
 * silme bir işaret bırakır; silmeden önce başlamış bir okuma sonucunu
 * yazamaz. Redis kapalıyken yapılan silmeler hatırlanır, bağlantı gelince
 * bütün önbellek temizlenir. Uygulama dışından (psql) yapılan değişiklikleri
 * yalnız süre (TTL) sınırlar.
 *
 * Redis yoksa ya da çökerse uygulama ÇALIŞMAYA DEVAM EDER: okumalar
 * doğrudan veritabanına gider.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly cfg: RedisConfig;
  private client: Redis | null = null;
  private ready = false;
  private flushPending = false;
  private lastErrorLog = 0;

  private readonly mem = new Map<string, Map<string, MemEntry>>();
  private readonly memTombs = new Map<string, number>();
  private readonly memCounters = new Map<string, { n: number; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  private readonly counters = { hits: 0, misses: 0, writes: 0, invalidations: 0, errors: 0 };
  private readonly groupCounters = new Map<string, { hits: number; misses: number }>();

  constructor(config: ConfigService) {
    this.cfg = config.get<RedisConfig>('redis') ?? {
      url: '',
      prefix: 'st',
      cacheEnabled: true,
      connectTimeoutMs: 2000,
    };
  }

  get mode(): CacheMode {
    if (!this.cfg.cacheEnabled) return 'off';
    return this.cfg.url ? 'redis' : 'memory';
  }

  /** Önbellek açık mı? (kapalıysa her okuma doğrudan yükleyiciye gider) */
  get enabled(): boolean {
    return this.mode !== 'off';
  }

  async onModuleInit(): Promise<void> {
    if (this.mode !== 'redis') {
      this.ready = this.mode === 'memory';
      this.logger.log(
        this.mode === 'off'
          ? 'Önbellek kapalı (CACHE_ENABLED=false).'
          : 'Redis yapılandırılmamış: süreç içi bellek önbelleği kullanılıyor.',
      );
      return;
    }
    const client = new Redis(this.cfg.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: this.cfg.connectTimeoutMs,
      commandTimeout: 800,
      retryStrategy: (times) => Math.min(times * 400, 5000),
    });
    client.defineCommand('stSetFresh', { numberOfKeys: 3, lua: LUA_SET_FRESH });
    client.defineCommand('stInvalidate', { numberOfKeys: 2, lua: LUA_INVALIDATE });
    client.defineCommand('stHit', { numberOfKeys: 1, lua: LUA_HIT });
    client.on('ready', () => {
      this.ready = true;
      this.logger.log('Redis bağlantısı hazır.');
      if (this.flushPending) {
        void this.flushAll()
          .then(() => (this.flushPending = false))
          .catch(() => undefined);
      }
    });
    client.on('close', () => {
      this.ready = false;
    });
    client.on('error', (err) => this.logError('Redis hatası', err));
    this.client = client;
    try {
      await client.connect();
    } catch (err) {
      // Açılışta Redis yok: uygulama açılır, bağlantı arka planda yeniden denenir.
      this.logError('Redis\'e bağlanılamadı; önbellek devre dışı, yeniden denenecek', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      if (this.ready) await this.client.quit().catch(() => this.client?.disconnect());
      else this.client.disconnect();
      this.client = null;
      this.ready = false;
    }
  }

  // ── Okuma / yazma ────────────────────────────────────────────────────

  /** Önbellekte varsa döner; yoksa `loader` çalışır ve sonucu saklanır. */
  async wrap<T>(
    scope: string,
    group: string,
    field: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (!this.enabled) return loader();
    const hit = await this.lookup<T>(scope, group, field);
    if (hit.found) return hit.value as T;

    const key = `${scope}|${group}|${field}`;
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const task = (async () => {
      const value = await loader();
      await this.store(scope, group, field, value, ttlSeconds, hit.startedAt);
      return value;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  /** Önbellekte arar. Hata (Redis yok) = bulunamadı. */
  async lookup<T>(scope: string, group: string, field: string): Promise<CacheLookup<T>> {
    const startedAt = Date.now();
    if (!this.enabled) return { found: false, startedAt };
    let raw: string | undefined;
    try {
      raw = await this.readRaw(scope, group, field);
    } catch (err) {
      this.counters.errors++;
      this.logError('Önbellek okunamadı', err as Error);
    }
    const stat = this.stat(group);
    if (raw === undefined) {
      this.counters.misses++;
      stat.misses++;
      return { found: false, startedAt };
    }
    this.counters.hits++;
    stat.hits++;
    return { found: true, value: JSON.parse(raw) as T, startedAt };
  }

  /**
   * Saklar. `startedAt`: değeri yüklemeye başladığınız an (lookup'ın verdiği);
   * ondan sonra grup silindiyse değer eskidir ve YAZILMAZ.
   */
  async store(
    scope: string,
    group: string,
    field: string,
    value: unknown,
    ttlSeconds: number,
    startedAt: number = Date.now(),
  ): Promise<boolean> {
    if (!this.enabled || value === undefined) return false;
    const json = JSON.stringify(value);
    if (json === undefined || json.length > MAX_ENTRY_CHARS) return false;
    const ttl = Math.max(1, Math.round(ttlSeconds * (0.9 + Math.random() * 0.2)));
    try {
      const ok = await this.writeRaw(scope, group, field, json, ttl, startedAt);
      if (ok) this.counters.writes++;
      return ok;
    } catch (err) {
      this.counters.errors++;
      this.logError('Önbelleğe yazılamadı', err as Error);
      return false;
    }
  }

  // ── Geçersiz kılma ───────────────────────────────────────────────────

  /** `scope` = '*' → grubun bütün kapsamları (yönetim işlemleri için). */
  async invalidate(scope: string, group: string): Promise<void> {
    await this.invalidateMany([[scope, group]]);
  }

  async invalidateMany(pairs: ReadonlyArray<readonly [string, string]>): Promise<void> {
    if (!this.enabled || pairs.length === 0) return;
    const unique = [...new Map(pairs.map((p) => [`${p[0]}|${p[1]}`, p])).values()];
    this.counters.invalidations += unique.length;
    const now = Date.now();
    if (this.mode === 'memory') {
      for (const [scope, group] of unique) this.memInvalidate(scope, group, now);
      return;
    }
    if (!this.client || !this.ready) {
      // Silme iletilemedi: bağlantı gelince bütün önbellek temizlenecek.
      this.flushPending = true;
      return;
    }
    try {
      for (const [scope, group] of unique) {
        const scopes = scope === '*' ? await this.scopesOf(group) : [scope];
        const pipeline = this.client.pipeline();
        if (scope === '*') {
          // Henüz hash'i olmayan kapsamlarda süren okumalar da eski veri yazmasın.
          void pipeline.set(this.tombKey('*', group), String(now), 'EX', TOMBSTONE_SECONDS); // kuyruğa eklenir; sonuç exec()'te
        }
        for (const s of scopes) {
          void (pipeline as unknown as RedisCommands).stInvalidate(
            this.hashKey(s, group),
            this.tombKey(s, group),
            String(now),
            String(TOMBSTONE_SECONDS),
          );
        }
        await pipeline.exec();
      }
    } catch (err) {
      this.counters.errors++;
      this.flushPending = true;
      this.logError('Önbellek geçersiz kılınamadı', err as Error);
    }
  }

  /** Bütün önbellek girdilerini siler (sayaçlara ve işaretlere dokunmaz). */
  async flushAll(): Promise<number> {
    if (this.mode === 'memory') {
      const n = [...this.mem.values()].reduce((s, m) => s + m.size, 0);
      this.mem.clear();
      this.memTombs.clear();
      return n;
    }
    if (!this.client || !this.ready) return 0;
    let removed = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${this.cfg.prefix}:c:*`, 'COUNT', 500);
      cursor = next;
      if (keys.length) {
        removed += keys.length;
        await this.client.unlink(...keys);
      }
    } while (cursor !== '0');
    return removed;
  }

  // ── Sayaç (hız sınırı) ───────────────────────────────────────────────

  /** `windowSeconds` penceresinde bu anahtarın kaçıncı çağrısı? Redis yoksa bellekte sayar. */
  async hit(key: string, windowSeconds: number): Promise<{ count: number; retryAfter: number }> {
    const redisKey = `${this.cfg.prefix}:rl:${key}`;
    if (this.client && this.ready) {
      try {
        const res = (await (this.client as unknown as RedisCommands).stHit(
          redisKey,
          String(windowSeconds),
        )) as [number, number];
        return { count: Number(res[0]), retryAfter: Math.max(1, Number(res[1])) };
      } catch (err) {
        this.counters.errors++;
        this.logError('Sayaç artırılamadı', err as Error);
      }
    }
    const now = Date.now();
    const cur = this.memCounters.get(key);
    if (!cur || cur.expiresAt <= now) {
      this.memCounters.set(key, { n: 1, expiresAt: now + windowSeconds * 1000 });
      if (this.memCounters.size > 20_000) this.sweepCounters(now);
      return { count: 1, retryAfter: windowSeconds };
    }
    cur.n++;
    return { count: cur.n, retryAfter: Math.max(1, Math.ceil((cur.expiresAt - now) / 1000)) };
  }

  // ── Durum ────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    if (this.mode === 'memory') return true;
    if (!this.client || !this.ready) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  stats(): CacheStats {
    return {
      mode: this.mode,
      ready: this.ready,
      ...this.counters,
      flushPending: this.flushPending,
      byGroup: Object.fromEntries(this.groupCounters),
    };
  }

  /** Redis sunucusunun belleği (INFO memory) — yönetim ekranı için. */
  async serverInfo(): Promise<Record<string, string> | null> {
    if (!this.client || !this.ready) return null;
    try {
      const text = await this.client.info('memory');
      const out: Record<string, string> = {};
      for (const line of text.split('\r\n')) {
        const [k, v] = line.split(':');
        if (k && v && ['used_memory_human', 'maxmemory_human', 'maxmemory_policy'].includes(k)) out[k] = v;
      }
      out.keys = String(await this.client.dbsize());
      return out;
    } catch {
      return null;
    }
  }

  // ── İç ───────────────────────────────────────────────────────────────

  private hashKey(scope: string, group: string): string {
    return `${this.cfg.prefix}:c:${scope}:${group}`;
  }

  private tombKey(scope: string, group: string): string {
    return `${this.cfg.prefix}:t:${scope}:${group}`;
  }

  private stat(group: string): { hits: number; misses: number } {
    let s = this.groupCounters.get(group);
    if (!s) {
      s = { hits: 0, misses: 0 };
      this.groupCounters.set(group, s);
    }
    return s;
  }

  private async readRaw(scope: string, group: string, field: string): Promise<string | undefined> {
    if (this.mode === 'memory') {
      const entry = this.mem.get(`${scope}|${group}`)?.get(field);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        this.mem.get(`${scope}|${group}`)?.delete(field);
        return undefined;
      }
      return entry.value;
    }
    if (!this.client || !this.ready) return undefined;
    const stored = await this.client.hget(this.hashKey(scope, group), field);
    if (stored === null) return undefined;
    const bar = stored.indexOf('|');
    if (bar < 0 || Number(stored.slice(0, bar)) <= Date.now()) return undefined;
    return stored.slice(bar + 1);
  }

  private async writeRaw(
    scope: string,
    group: string,
    field: string,
    json: string,
    ttl: number,
    startedAt: number,
  ): Promise<boolean> {
    if (this.mode === 'memory') {
      const limit = startedAt - CLOCK_SKEW_MS;
      const tomb = this.memTombs.get(`${scope}|${group}`);
      if (tomb !== undefined && tomb >= limit) return false;
      const all = this.memTombs.get(`*|${group}`);
      if (all !== undefined && all >= limit) return false;
      const k = `${scope}|${group}`;
      let bucket = this.mem.get(k);
      if (!bucket) {
        bucket = new Map();
        this.mem.set(k, bucket);
      }
      if (bucket.size >= MEM_MAX_FIELDS) {
        const oldest = bucket.keys().next().value;
        if (oldest !== undefined) bucket.delete(oldest);
      }
      bucket.set(field, { expiresAt: Date.now() + ttl * 1000, value: json });
      return true;
    }
    if (!this.client || !this.ready) return false;
    const res = await (this.client as unknown as RedisCommands).stSetFresh(
      this.hashKey(scope, group),
      this.tombKey(scope, group),
      this.tombKey('*', group),
      field,
      `${Date.now() + ttl * 1000}|${json}`,
      String(startedAt),
      String(ttl),
      String(CLOCK_SKEW_MS),
    );
    return Number(res) === 1;
  }

  private memInvalidate(scope: string, group: string, now: number): void {
    const keys =
      scope === '*'
        ? [...this.mem.keys()].filter((k) => k.endsWith(`|${group}`))
        : [`${scope}|${group}`];
    for (const k of keys) {
      this.mem.delete(k);
      this.memTombs.set(k, now);
    }
    if (scope === '*') this.memTombs.set(`*|${group}`, now);
    if (this.memTombs.size > 5000) {
      for (const [k, t] of this.memTombs) if (t < now - TOMBSTONE_SECONDS * 1000) this.memTombs.delete(k);
    }
  }

  private async scopesOf(group: string): Promise<string[]> {
    const found = new Set<string>();
    const prefix = `${this.cfg.prefix}:c:`;
    let cursor = '0';
    do {
      const [next, keys] = await this.client!.scan(cursor, 'MATCH', `${prefix}*:${group}`, 'COUNT', 500);
      cursor = next;
      for (const k of keys) found.add(k.slice(prefix.length, k.length - group.length - 1));
    } while (cursor !== '0');
    return [...found];
  }

  private sweepCounters(now: number): void {
    for (const [k, v] of this.memCounters) if (v.expiresAt <= now) this.memCounters.delete(k);
  }

  private logError(message: string, err: Error): void {
    const now = Date.now();
    if (now - this.lastErrorLog < 30_000) return;
    this.lastErrorLog = now;
    this.logger.warn(`${message}: ${err.message}`);
  }
}

/** ioredis `defineCommand` ile eklenen komutlar. */
interface RedisCommands {
  stSetFresh(...args: string[]): Promise<number>;
  stInvalidate(...args: string[]): Promise<number>;
  stHit(...args: string[]): Promise<[number, number]>;
}
