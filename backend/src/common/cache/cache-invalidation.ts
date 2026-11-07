import {
  DataSource,
  EntitySubscriberInterface,
  TransactionCommitEvent,
  TransactionRollbackEvent,
} from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { ShopContext } from '../shop/shop-context';
import { ShopScopedEntity } from '../shop/shop-scoped.entity';
import {
  CacheGroup,
  GLOBAL_SCOPE,
  GLOBAL_TABLE_GROUPS,
  IGNORED_TABLES,
  SHOP_TABLE_GROUPS,
} from './cache.groups';
import type { CacheService } from './cache.service';

/**
 * Önbelleğin KENDİLİĞİNDEN tutarlı kalması: uygulamanın veritabanına yaptığı
 * her yazma (INSERT/UPDATE/DELETE/TRUNCATE) burada yakalanır ve etkilediği
 * önbellek grupları silinir.
 *
 * Neden TypeORM olay abonesi (afterInsert...) değil de sorgu katmanı?
 * Abone yalnız `save`/`remove` çağrılarında çalışır; `update()`, `delete()`,
 * `increment()`, `softDelete()` ve ham `query()` (stok düşümü gibi) abonelere
 * hiç uğramaz. Hepsi PostgresQueryRunner.query'den geçtiği için tek bir
 * noktada sarmak eksiksiz kapsar.
 *
 * İşlem içindeki yazmalar COMMIT'ten sonra işlenir (commit'ten önce silinirse
 * bir okuyucu eski veriyi yeniden önbelleğe koyabilir); geri alınan işlemin
 * yazmaları atılır. İşlem dışındaki yazmalar hemen işlenir.
 */

const PATCHED = Symbol.for('stocktrack.cacheInvalidationPatched');
const PENDING = new WeakMap<QueryRunner, Map<string, [string, string]>>();

interface Sink {
  cache: CacheService;
  /** tablo adı → dükkâna bağlı mı */
  scoped: Map<string, boolean>;
}
let sink: Sink | null = null;

const SINGLE_WRITE =
  /^\s*(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?(?:"?[a-z0-9_]+"?\.)?"?([a-z0-9_]+)"?/i;
const CTE_WRITE = /\b(?:insert\s+into|update|delete\s+from)\s+(?:only\s+)?(?:"?[a-z0-9_]+"?\.)?"?([a-z0-9_]+)"?/gi;

/** Sorgu bir yazma ise etkilediği tablolar (değilse boş). */
export function writtenTables(sql: string): string[] {
  // Hızlı ret: SELECT, SAVEPOINT, COMMIT ... (i/u/d/t/w ile başlamayanlar)
  const first = sql.trimStart().charAt(0).toLowerCase();
  if (first === '' || !'iudtw'.includes(first)) return [];
  const m = SINGLE_WRITE.exec(sql);
  if (m) return [m[1].toLowerCase()];
  if (/^\s*with\b/i.test(sql)) {
    const out = new Set<string>();
    for (const x of sql.matchAll(CTE_WRITE)) out.add(x[1].toLowerCase());
    return [...out];
  }
  return [];
}

/** Bir tabloya yazılınca silinecek (kapsam, grup) çiftleri. */
export function pairsForWrite(
  table: string,
  scoped: boolean,
  shopId: string | undefined,
  unscoped: boolean,
): [string, string][] {
  if (IGNORED_TABLES.has(table)) return [];
  const pairs: [string, string][] = [];
  if (scoped) {
    // Bağlam yoksa ya da bilerek süzgeçsizse (göç, dükkân kopyalama) hangi dükkân
    // olduğu bilinmez: tüm dükkânların grubu silinir.
    const scope = !unscoped && shopId ? shopId : '*';
    pairs.push([scope, CacheGroup.SHOP]);
    for (const g of SHOP_TABLE_GROUPS[table] ?? []) pairs.push([scope, g]);
  }
  for (const g of GLOBAL_TABLE_GROUPS[table] ?? []) pairs.push([GLOBAL_SCOPE, g]);
  return pairs;
}

function noteWrite(runner: QueryRunner, tables: string[]): Promise<void> | void {
  if (!sink || tables.length === 0) return;
  const store = ShopContext.current();
  const all: [string, string][] = [];
  for (const table of tables) {
    all.push(...pairsForWrite(table, sink.scoped.get(table) === true, store?.shopId, !!store?.unscoped));
  }
  if (all.length === 0) return;
  if (runner.isTransactionActive) {
    let pending = PENDING.get(runner);
    if (!pending) {
      pending = new Map();
      PENDING.set(runner, pending);
    }
    for (const p of all) pending.set(`${p[0]}|${p[1]}`, p);
    return;
  }
  return sink.cache.invalidateMany(all);
}

/** İşlem bitince biriken silmeleri işler (commit) ya da atar (rollback). */
export class CacheInvalidationSubscriber implements EntitySubscriberInterface {
  async afterTransactionCommit(event: TransactionCommitEvent): Promise<void> {
    const runner = event.queryRunner;
    // İç içe işlemde (savepoint) yalnız en dıştaki commit gerçek commit'tir.
    if (runner.isTransactionActive) return;
    const pending = PENDING.get(runner);
    if (!pending || pending.size === 0 || !sink) return;
    PENDING.delete(runner);
    await sink.cache.invalidateMany([...pending.values()]);
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    const runner = event.queryRunner;
    // Savepoint'e dönüş: dıştaki işlem sürüyor, biriken silmeler korunur
    // (fazladan silmek zararsızdır).
    if (runner.isTransactionActive) return;
    PENDING.delete(runner);
  }
}

const INSTALLED = new WeakSet<DataSource>();

/** Sorgu katmanını sarar ve aboneyi kurar. Birden çok çağrı zararsızdır. */
export function installCacheInvalidation(dataSource: DataSource, cache: CacheService): void {
  const scoped = new Map<string, boolean>();
  for (const meta of dataSource.entityMetadatas) {
    const target = meta.target;
    scoped.set(
      meta.tableName.toLowerCase(),
      typeof target === 'function' && target.prototype instanceof ShopScopedEntity,
    );
  }
  sink = { cache, scoped };

  const proto = PostgresQueryRunner.prototype as unknown as Record<string | symbol, unknown>;
  if (!proto[PATCHED]) {
    const original = proto.query as (
      this: QueryRunner,
      query: string,
      parameters?: unknown[],
      useStructuredResult?: boolean,
    ) => Promise<unknown>;
    proto.query = async function patched(
      this: QueryRunner,
      query: string,
      parameters?: unknown[],
      useStructuredResult?: boolean,
    ): Promise<unknown> {
      const result = await original.call(this, query, parameters, useStructuredResult);
      if (typeof query === 'string') {
        const tables = writtenTables(query);
        if (tables.length) await noteWrite(this, tables);
      }
      return result;
    };
    proto[PATCHED] = true;
  }

  if (!INSTALLED.has(dataSource)) {
    dataSource.subscribers.push(new CacheInvalidationSubscriber());
    INSTALLED.add(dataSource);
  }
}
