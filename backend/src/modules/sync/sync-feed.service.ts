import { BadRequestException, GoneException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { SyncReplica } from './entities/sync-replica.entity';
import { replicatedTables, schemaHash, SyncTable } from './sync-tables';

/** Protokol sürümü: uçların biçimi değişirse artar. */
export const SYNC_PROTOCOL = 1;

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export interface ChangeRow {
  seq: string;
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  /** upsert'te satırın BUGÜNKÜ hali (veritabanı sütun adlarıyla); delete'te null. */
  row: Record<string, unknown> | null;
}

export interface ChangesPage {
  changes: ChangeRow[];
  /** Bir sonraki istekte `since` olarak gönderilecek imleç. */
  lastSeq: string;
  hasMore: boolean;
  /** Açık bir transaction bekleniyor: biraz sonra yeniden sorun. */
  waiting: boolean;
}

interface LogRow {
  seq: string;
  table_name: string;
  row_id: string;
  shop_id: string | null;
  op: 'I' | 'U' | 'D';
  changed_at: Date;
}

/**
 * Günlük sayfasında güvenle verilebilecek satırlar: sıra numaraları ardışık
 * olmalı. Boşluk, henüz bitmemiş bir transaction'ın (ya da geri alınmış
 * birinin) numarasıdır; boşluktan sonraki satır `gapWaitMs`'den yeniyse
 * orada durulur (yoksa o transaction bitince değişikliği kaçırılırdı).
 * Daha eskiyse boşluk geri alınmış sayılır ve geçilir.
 */
export function safePrefix<T extends { seq: string; changed_at: Date }>(
  rows: T[],
  since: bigint,
  now: number,
  gapWaitMs: number,
): { safe: T[]; waiting: boolean } {
  const safe: T[] = [];
  let expected = since + 1n;
  for (const r of rows) {
    const seq = BigInt(r.seq);
    if (seq !== expected && now - new Date(r.changed_at).getTime() < gapWaitMs) {
      return { safe, waiting: true };
    }
    safe.push(r);
    expected = seq + 1n;
  }
  return { safe, waiting: false };
}

/**
 * Merkezden replikaya veri akışı (docs/SYNC.md § Uçlar): şema, ilk yükleme
 * (anlık görüntü), değişiklik akışı ve kimlikle satır getirme. Satırlar
 * veritabanı sütun adlarıyla, `to_jsonb` biçiminde döner; replika aynı
 * sürümdeki şemaya `jsonb_populate_record` ile yazar.
 *
 * Replika yalnız kendi dükkânlarının verisini alır (kapsam, bkz. sync-tables).
 */
@Injectable()
export class SyncFeedService {
  private readonly logger = new Logger(SyncFeedService.name);
  private readonly gapWaitMs: number;
  private cache?: { tables: SyncTable[]; byName: Map<string, SyncTable>; hash: string };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.gapWaitMs = (config.get<number>('sync.gapWaitSeconds') ?? 60) * 1000;
  }

  /** Eşitlenen tablolar (bağımlılık sırasıyla) ve şema özeti. */
  schema(): { tables: SyncTable[]; byName: Map<string, SyncTable>; hash: string } {
    if (!this.cache) {
      const tables = replicatedTables(this.dataSource);
      this.cache = {
        tables,
        byName: new Map(tables.map((t) => [t.name, t])),
        hash: schemaHash(tables, (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)),
      };
    }
    return this.cache;
  }

  async instance(): Promise<{ instanceId: string; prunedSeq: bigint }> {
    let rows: { instance_id: string; sync_pruned_seq: string }[] = await this.dataSource.query(
      `SELECT instance_id, sync_pruned_seq FROM system_settings WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    );
    if (!rows.length) {
      rows = await this.dataSource.query(
        `INSERT INTO system_settings DEFAULT VALUES RETURNING instance_id, sync_pruned_seq`,
      );
    }
    return { instanceId: rows[0].instance_id, prunedSeq: BigInt(rows[0].sync_pruned_seq ?? 0) };
  }

  async currentSeq(): Promise<string> {
    const [row] = await this.dataSource.query(`SELECT COALESCE(MAX(seq), 0)::text AS seq FROM sync_changes`);
    return row.seq;
  }

  async hello(replica: SyncReplica) {
    const [{ instanceId, prunedSeq }, seq] = await Promise.all([this.instance(), this.currentSeq()]);
    return {
      protocol: SYNC_PROTOCOL,
      serverId: instanceId,
      role: 'primary' as const,
      schemaHash: this.schema().hash,
      seq,
      prunedSeq: prunedSeq.toString(),
      serverTime: new Date().toISOString(),
      replica: { id: replica.id, name: replica.name, shopIds: replica.shopIds ?? [] },
    };
  }

  table(name: string): SyncTable {
    const t = this.schema().byName.get(name);
    if (!t) throw new BadRequestException(`Eşitlenmeyen tablo: ${name}`);
    return t;
  }

  /**
   * Kapsam koşulu (`alias` tablonun takma adı). Replika bütün dükkânlara
   * hizmet ediyorsa koşul yoktur. `param` dükkân kimlikleri dizisinin yeri.
   */
  scopeSql(table: SyncTable, alias: string, scope: string[] | null, param: string): string | null {
    if (!scope) return null;
    const any = `ANY(${param}::uuid[])`;
    switch (table.scope) {
      case 'shop':
        return `${alias}.shop_id = ${any}`;
      case 'transfer':
        return `(${alias}.from_shop_id = ${any} OR ${alias}.to_shop_id = ${any})`;
      case 'transfer_item':
        return `EXISTS (SELECT 1 FROM shop_transfers st WHERE st.id = ${alias}.transfer_id
                        AND (st.from_shop_id = ${any} OR st.to_shop_id = ${any}))`;
      default:
        return null;
    }
  }

  static scopeOf(replica: SyncReplica): string[] | null {
    return replica.shopIds?.length ? replica.shopIds : null;
  }

  /** İlk yükleme: tablonun kapsamdaki satırları, kimlik sırasıyla sayfa sayfa. */
  async snapshot(replica: SyncReplica, tableName: string, afterId: string | undefined, limit: number) {
    const table = this.table(tableName);
    const scope = SyncFeedService.scopeOf(replica);
    const params: unknown[] = [afterId || NIL_UUID, limit];
    const cond = this.scopeSql(table, 't', scope, '$3');
    if (cond) params.push(scope);
    const rows: { row: Record<string, unknown> }[] = await this.dataSource.query(
      `SELECT to_jsonb(t) AS row FROM "${table.name}" t
        WHERE t.id > $1::uuid ${cond ? `AND ${cond}` : ''}
        ORDER BY t.id LIMIT $2`,
      params,
    );
    const last = rows[rows.length - 1]?.row.id as string | undefined;
    return {
      table: table.name,
      rows: rows.map((r) => r.row),
      nextAfterId: last ?? null,
      done: rows.length < limit,
    };
  }

  /** Kimlikle satırlar (replika yerel değişikliği geri alırken). Olmayanlar `missing`. */
  async rows(replica: SyncReplica, tableName: string, ids: string[]) {
    const table = this.table(tableName);
    const found = await this.fetchRows(table, ids, SyncFeedService.scopeOf(replica));
    return {
      table: table.name,
      rows: [...found.values()],
      missing: ids.filter((id) => !found.has(id)),
    };
  }

  private async fetchRows(
    table: SyncTable,
    ids: string[],
    scope: string[] | null,
  ): Promise<Map<string, Record<string, unknown>>> {
    if (!ids.length) return new Map();
    const params: unknown[] = [ids];
    const cond = this.scopeSql(table, 't', scope, '$2');
    if (cond) params.push(scope);
    const rows: { row: Record<string, unknown> }[] = await this.dataSource.query(
      `SELECT to_jsonb(t) AS row FROM "${table.name}" t WHERE t.id = ANY($1::uuid[]) ${cond ? `AND ${cond}` : ''}`,
      params,
    );
    return new Map(rows.map((r) => [r.row.id as string, r.row]));
  }

  /**
   * Değişiklik akışı: `since`'ten sonraki değişiklikler, kapsama süzülmüş,
   * satır başına tek kayıt (sayfadaki son değişiklik) ve satırın BUGÜNKÜ
   * haliyle. Aynı satır sonraki sayfada yeniden gelebilir; replika kimliğe
   * göre yazdığından zararsızdır.
   */
  async changes(replica: SyncReplica, sinceText: string, limit: number): Promise<ChangesPage> {
    if (!/^\d+$/.test(sinceText)) throw new BadRequestException('since bir sayı olmalı.');
    const since = BigInt(sinceText);
    const { prunedSeq } = await this.instance();
    if (since < prunedSeq) {
      throw new GoneException({
        code: 'RESNAPSHOT',
        message: 'Bu kadar eski değişiklikler silinmiş; yerel sunucu baştan yüklenmeli (anlık görüntü).',
        prunedSeq: prunedSeq.toString(),
      });
    }

    const log: LogRow[] = await this.dataSource.query(
      `SELECT seq::text AS seq, table_name, row_id, shop_id, op, changed_at
         FROM sync_changes WHERE seq > $1 ORDER BY seq LIMIT $2`,
      [since.toString(), limit],
    );
    const { safe, waiting } = safePrefix(log, since, Date.now(), this.gapWaitMs);
    const lastSeq = safe.length ? safe[safe.length - 1].seq : since.toString();

    const scope = SyncFeedService.scopeOf(replica);
    const { byName } = this.schema();
    // Satır başına son değişiklik.
    const latest = new Map<string, LogRow>();
    for (const r of safe) {
      if (!byName.has(r.table_name)) continue;
      const key = `${r.table_name}:${r.row_id}`;
      latest.delete(key);
      latest.set(key, r);
    }
    const idsByTable = new Map<string, string[]>();
    for (const r of latest.values()) {
      const list = idsByTable.get(r.table_name) ?? [];
      list.push(r.row_id);
      idsByTable.set(r.table_name, list);
    }
    const current = new Map<string, Record<string, unknown>>();
    for (const [name, ids] of idsByTable) {
      const found = await this.fetchRows(byName.get(name)!, ids, scope);
      for (const [id, row] of found) current.set(`${name}:${id}`, row);
    }

    const changes: ChangeRow[] = [];
    for (const [key, r] of latest) {
      const row = current.get(key);
      if (row) {
        changes.push({ seq: r.seq, table: r.table_name, id: r.row_id, op: 'upsert', row });
        continue;
      }
      // Satır yok: silinmiş ya da kapsam dışı. Kapsam dışı olduğu bilinen
      // (başka dükkânın) satır için hiçbir şey gönderilmez.
      const table = byName.get(r.table_name)!;
      const outOfScope =
        scope && table.scope === 'shop' && r.shop_id && !scope.includes(r.shop_id);
      if (outOfScope) continue;
      if (scope && r.op !== 'D' && table.scope !== 'global') {
        // Satır var ama kapsam dışı (ör. başka dükkânların belgesi) → atla.
        const [{ n }] = await this.dataSource.query(
          `SELECT COUNT(*)::int AS n FROM "${table.name}" WHERE id = $1`,
          [r.row_id],
        );
        if (n > 0) continue;
      }
      changes.push({ seq: r.seq, table: r.table_name, id: r.row_id, op: 'delete', row: null });
    }
    changes.sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1));

    return {
      changes,
      lastSeq,
      hasMore: waiting || log.length === limit,
      waiting,
    };
  }

  /** Eski günlük satırlarını siler (merkez, günde bir). */
  async prune(retentionDays: number): Promise<number> {
    const rows: { seq: string }[] = await this.dataSource.query(
      `DELETE FROM sync_changes WHERE changed_at < now() - ($1 || ' days')::interval RETURNING seq::text AS seq`,
      [String(retentionDays)],
    );
    if (!rows.length) return 0;
    const max = rows.reduce((m, r) => (BigInt(r.seq) > m ? BigInt(r.seq) : m), 0n);
    await this.instance();
    await this.dataSource.query(
      `UPDATE system_settings SET sync_pruned_seq = GREATEST(sync_pruned_seq, $1::bigint)`,
      [max.toString()],
    );
    this.logger.log(`Eşitleme günlüğü: ${rows.length} eski satır silindi (≤ ${max}).`);
    return rows.length;
  }
}
