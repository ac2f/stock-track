import { DataSource, EntityMetadata } from 'typeorm';
import { ShopScopedEntity } from '../../common/shop/shop-scoped.entity';

/**
 * Hangi tablolar eşitlenir, kapsamları ve sıraları (docs/SYNC.md § Tablolar).
 *
 * Günlüğe hiç girmeyenler: eşitlemenin kendi tabloları ve tekrar koruması
 * kayıtları. Replikaya gönderilmeyenler ayrıca: sisteme ait gizli ayarlar
 * (Telegram bot anahtarı vb.; replika bot çalıştırmaz).
 */
export const NO_CAPTURE_TABLES = new Set([
  'sync_changes',
  'sync_replicas',
  'replica_outbox',
  'replica_state',
  'idempotency_keys',
]);

export const NOT_REPLICATED_TABLES = new Set([...NO_CAPTURE_TABLES, 'system_settings']);

/** Bir tablonun replikaya hangi satırlarının gittiği. */
export type TableScope =
  | 'shop' // shop_id replikanın dükkânlarından biri
  | 'global' // bütün satırlar (dükkânlar, kullanıcılar, döviz kurları)
  | 'transfer' // dükkânlar arası belge: satan ya da alan dükkân replikanınki
  | 'transfer_item'; // belgesi replikanınki

export interface SyncColumn {
  name: string;
  type: string;
  nullable: boolean;
  array: boolean;
}

export interface SyncTable {
  name: string;
  scope: TableScope;
  /** Dükkâna bağlı varlık mı (uygulama sorguları dükkâna süzülür). */
  shopScoped: boolean;
  /** Dış anahtarla bağlı olduğu tablolar (eşitlenenler arasından). */
  dependsOn: string[];
  /** Bağımlılık sırası: önce düşük sayılar yazılır. */
  order: number;
  columns: SyncColumn[];
}

const SPECIAL_SCOPES: Record<string, TableScope> = {
  shop_transfers: 'transfer',
  shop_transfer_items: 'transfer_item',
};

function scopeOf(meta: EntityMetadata): TableScope {
  if (SPECIAL_SCOPES[meta.tableName]) return SPECIAL_SCOPES[meta.tableName];
  if (meta.columns.some((c) => c.databaseName === 'shop_id')) return 'shop';
  return 'global';
}

function isShopScoped(meta: EntityMetadata): boolean {
  const t = meta.target;
  return typeof t === 'function' && t.prototype instanceof ShopScopedEntity;
}

function columnType(c: EntityMetadata['columns'][number]): string {
  const t = c.type;
  if (typeof t === 'string') return t;
  if (typeof t === 'function') return (t as { name?: string }).name?.toLowerCase() ?? 'unknown';
  return 'unknown';
}

/**
 * Eşitlenen tabloların listesi, dış anahtar sırasına göre (önce bağımsızlar).
 * Döngü varsa (birbirine bağlı iki tablo) kalanlar ada göre sona eklenir;
 * ajan bu yüzden yazarken dış anahtar denetimini erteler (docs/SYNC.md).
 */
export function replicatedTables(dataSource: DataSource): SyncTable[] {
  const metas = dataSource.entityMetadatas.filter(
    (m) => m.tableType === 'regular' && !NOT_REPLICATED_TABLES.has(m.tableName),
  );
  const names = new Set(metas.map((m) => m.tableName));
  const deps = new Map<string, Set<string>>();
  for (const m of metas) {
    const set = new Set<string>();
    for (const fk of m.foreignKeys) {
      const ref = fk.referencedEntityMetadata.tableName;
      if (ref !== m.tableName && names.has(ref)) set.add(ref);
    }
    deps.set(m.tableName, set);
  }

  const order = new Map<string, number>();
  const pending = new Set(names);
  let level = 0;
  while (pending.size) {
    const ready = [...pending]
      .filter((n) => [...deps.get(n)!].every((d) => order.has(d)))
      .sort();
    const batch = ready.length ? ready : [...pending].sort();
    for (const n of batch) {
      order.set(n, level++);
      pending.delete(n);
    }
  }

  return metas
    .map((m) => ({
      name: m.tableName,
      scope: scopeOf(m),
      shopScoped: isShopScoped(m),
      dependsOn: [...deps.get(m.tableName)!].sort(),
      order: order.get(m.tableName)!,
      columns: m.columns
        .map((c) => ({
          name: c.databaseName,
          type: columnType(c),
          nullable: c.isNullable,
          array: !!c.isArray,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.order - b.order);
}

/** Değişiklik günlüğü tutulacak tablolar (replikaya gitmeyenler dahil). */
export function capturedTables(dataSource: DataSource): string[] {
  return dataSource.entityMetadatas
    .filter(
      (m) =>
        m.tableType === 'regular' &&
        !NO_CAPTURE_TABLES.has(m.tableName) &&
        m.primaryColumns.length === 1 &&
        m.primaryColumns[0].databaseName === 'id',
    )
    .map((m) => m.tableName)
    .sort();
}

/**
 * Şema özeti: tablo + sütun ad/tipleri. Merkez ve replika aynı sürümdeyse
 * aynıdır; farklıysa ajan eşitlemeyi durdurur (önce güncelleme).
 */
export function schemaHash(tables: SyncTable[], digest: (s: string) => string): string {
  const text = tables
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `${t.name}(${t.columns.map((c) => `${c.name}:${c.type}${c.array ? '[]' : ''}`).join(',')})`)
    .join(';');
  return digest(text);
}
