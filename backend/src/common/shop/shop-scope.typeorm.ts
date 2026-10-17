import { ForbiddenException } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntityMetadata,
  EntitySubscriberInterface,
  InsertEvent,
  ObjectLiteral,
  QueryBuilder,
  UpdateEvent,
} from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { MissingShopContextError, ShopContext } from './shop-context';
import { ShopScopedEntity } from './shop-scoped.entity';

/**
 * Dükkân süzgeci: dükkâna bağlı (`shopId` sütunu olan) her tablonun okuma,
 * güncelleme ve silme sorgusuna `shop_id = <bağlamdaki dükkân>` koşulunu
 * TypeORM'un kendisi ekler — `find`, `count`, sorgu kurucu, `increment`,
 * `softDelete` ... hepsi aynı noktadan (`createWhereExpression`) geçer.
 *
 * Böylece servislerin tek tek `where: { shopId }` yazması gerekmez; biri
 * unutulsa bile başka dükkânın verisi okunamaz. Bağlam yoksa sorgu hata
 * verir. TypeORM'un soft-delete için `deleted_at IS NULL` eklediği yerle
 * aynı yerdir.
 *
 * Kapsam: ana tablo. Birleştirilen (join) ilişkiler aynı dükkândan geldiği
 * için ayrıca süzülmez; yazarken başka dükkânın kaydına bağlanmayı
 * ShopScopeSubscriber engeller. Ham SQL (`query()`) süzülmez — oralarda
 * koşul elle yazılır.
 */

const SCOPED_QUERY_TYPES = new Set([
  'select',
  'update',
  'delete',
  'soft-delete',
  'restore',
]);

const PATCHED = Symbol.for('stocktrack.shopScopePatched');

const scopedCache = new WeakMap<EntityMetadata, ColumnMetadata | null>();

/**
 * Dükkâna bağlı tablonun `shop_id` sütunu; tablo dükkâna bağlı değilse null.
 * Ölçüt sütun adı değil, varlığın ShopScopedEntity'den türemesidir (ör.
 * dükkân üyeliği tablosunda da `shopId` vardır ama o süzülmez).
 */
function shopColumn(metadata: EntityMetadata): ColumnMetadata | null {
  let column = scopedCache.get(metadata);
  if (column === undefined) {
    const target = metadata.target;
    const scoped =
      typeof target === 'function' && target.prototype instanceof ShopScopedEntity;
    column = scoped ? metadata.findColumnWithPropertyName('shopId') ?? null : null;
    scopedCache.set(metadata, column);
  }
  return column;
}

/** Bu sorgu kurucunun ana tablosu için eklenecek koşul (yoksa null). */
function shopCondition(qb: QueryBuilder<ObjectLiteral>): string | null {
  const map = qb.expressionMap;
  const alias = map.mainAlias;
  if (!alias?.hasMetadata) return null;
  if (!SCOPED_QUERY_TYPES.has(map.queryType)) return null;
  const column = shopColumn(alias.metadata);
  if (!column) return null;

  const store = ShopContext.current();
  if (store?.unscoped) return null;
  const shopId = store?.shopId;
  if (!shopId) {
    throw new MissingShopContextError(`"${alias.metadata.tableName}" sorgusu`);
  }
  // Değer sorguya doğrudan yazılır: biçimi denetlenmiş bir UUID'dir.
  if (!ShopContext.isUuid(shopId)) {
    throw new MissingShopContextError(`geçersiz dükkân kimliği`);
  }
  const ref = map.aliasNamePrefixingEnabled
    ? `${qb.escape(alias.name)}.${qb.escape(column.databaseName)}`
    : qb.escape(column.databaseName);
  return `${ref} = '${shopId}'`;
}

/** TypeORM'a süzgeci takar. Birden çok çağrı zararsızdır. */
export function installShopQueryFilter(): void {
  const proto = QueryBuilder.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[PATCHED]) return;
  const original = proto.createWhereExpression as (this: QueryBuilder<ObjectLiteral>) => string;
  if (typeof original !== 'function') {
    throw new Error('TypeORM QueryBuilder.createWhereExpression bulunamadı; dükkân süzgeci kurulamadı.');
  }
  proto.createWhereExpression = function patched(this: QueryBuilder<ObjectLiteral>): string {
    const sql = original.call(this);
    const condition = shopCondition(this);
    if (!condition) return sql;
    const trimmed = sql.trim();
    if (!trimmed) return ` WHERE ${condition}`;
    // Özgün ifade " WHERE <koşullar>" biçimindedir; olduğu gibi paranteze
    // alınır ki içindeki OR'lar yeni koşulu delmesin.
    const at = sql.indexOf(' WHERE ');
    if (at < 0) return `${sql} WHERE ${condition}`;
    const head = sql.slice(0, at);
    const body = sql.slice(at + ' WHERE '.length);
    return `${head} WHERE (${body}) AND ${condition}`;
  };
  proto[PATCHED] = true;
}

/**
 * Kayıt eklenirken dükkânı bağlamdan yazar; başka dükkâna yazmayı ve başka
 * dükkânın kaydına bağlanmayı (ör. X dükkânının teklifine Y dükkânının
 * müşterisi) reddeder.
 */
export class ShopScopeSubscriber implements EntitySubscriberInterface {
  async beforeInsert(event: InsertEvent<ObjectLiteral>): Promise<void> {
    const entity = event.entity;
    if (!entity || !shopColumn(event.metadata)) return;
    const store = ShopContext.current();
    const contextShop = store?.shopId;
    if (!entity.shopId) {
      if (!contextShop) {
        throw new MissingShopContextError(`"${event.metadata.tableName}" kaydı eklenirken`);
      }
      entity.shopId = contextShop;
    } else if (contextShop && entity.shopId !== contextShop) {
      throw new ForbiddenException('Başka bir dükkâna kayıt yazılamaz.');
    }
    await assertSameShopReferences(event.manager, event.metadata, entity, entity.shopId);
  }

  async beforeUpdate(event: UpdateEvent<ObjectLiteral>): Promise<void> {
    const entity = event.entity;
    if (!entity || !shopColumn(event.metadata)) return;
    const contextShop = ShopContext.current()?.shopId;
    const shopId = (entity.shopId as string | undefined) ?? contextShop;
    if (contextShop && entity.shopId && entity.shopId !== contextShop) {
      throw new ForbiddenException('Kayıt başka bir dükkâna taşınamaz.');
    }
    if (shopId) {
      await assertSameShopReferences(event.manager, event.metadata, entity, shopId);
    }
  }
}

/** Kayıttaki dış anahtarlar (müşteri, plaka, depo ...) aynı dükkândan mı? */
async function assertSameShopReferences(
  manager: EntityManager,
  metadata: EntityMetadata,
  entity: ObjectLiteral,
  shopId: string,
): Promise<void> {
  const relations = [
    ...metadata.manyToOneRelations,
    ...metadata.oneToOneRelations.filter((r) => r.isOwning),
  ];
  for (const relation of relations) {
    const target = relation.inverseEntityMetadata;
    if (!shopColumn(target) || relation.joinColumns.length !== 1) continue;
    const joinColumn = relation.joinColumns[0];
    let value: unknown = joinColumn.getEntityValue(entity);
    if (value && typeof value === 'object') {
      value = (value as ObjectLiteral).id;
    }
    if (!ShopContext.isUuid(value)) continue;

    const rows: { shop_id: string | null }[] = await manager.query(
      `SELECT "shop_id" FROM ${manager.connection.driver.escape(target.tableName)} WHERE "id" = $1`,
      [value],
    );
    // Bulunamadıysa veritabanının kendi dış anahtar kısıtı karar verir
    // (aynı kayıtta birlikte eklenen ilişkiler henüz yazılmamış olabilir).
    const refShop = rows[0]?.shop_id;
    if (refShop && refShop !== shopId) {
      throw new ForbiddenException(
        `Başka bir dükkânın kaydına bağlanılamaz (${target.tableName}).`,
      );
    }
  }
}

const SUBSCRIBED = new WeakSet<DataSource>();

/** Süzgeci ve aboneyi verilen veri kaynağına kurar (uygulama + tohum CLI). */
export function installShopScope(dataSource: DataSource): void {
  installShopQueryFilter();
  if (SUBSCRIBED.has(dataSource)) return;
  dataSource.subscribers.push(new ShopScopeSubscriber());
  SUBSCRIBED.add(dataSource);
}
