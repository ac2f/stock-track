import { DataSource } from 'typeorm';
import { capturedTables } from './sync-tables';

const TRIGGER = 'st_sync_capture';

/**
 * Değişiklik günlüğü tetikleyici fonksiyonu. Her satır değişikliği
 * `sync_changes`'e bir satır yazar:
 *  - `stocktrack.sync_origin = 'upstream'` ayarlıysa (replikada ajan merkezden
 *    gelen veriyi yazıyor) YAZMAZ — yerel değişiklik sayılmasın,
 *  - içeriği değişmeyen güncellemeyi yazmaz,
 *  - zaman olarak clock_timestamp() (satırın yazıldığı an) kullanır; açık
 *    kalan transaction'ları beklemek için gereklidir (bkz. SyncFeedService).
 */
const FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION ${TRIGGER}() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  origin text := current_setting('stocktrack.sync_origin', true);
  rec jsonb;
BEGIN
  IF origin = 'upstream' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN rec := to_jsonb(OLD); ELSE rec := to_jsonb(NEW); END IF;
  IF (rec->>'id') IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = rec THEN RETURN NULL; END IF;
  INSERT INTO sync_changes (table_name, row_id, shop_id, op, origin, changed_at)
  VALUES (TG_TABLE_NAME, (rec->>'id')::uuid, NULLIF(rec->>'shop_id', '')::uuid,
          left(TG_OP, 1), NULLIF(origin, ''), clock_timestamp());
  RETURN NULL;
END $$;`;

/**
 * Tetikleyicileri kurar — her açılışta, şema senkronizasyonundan sonra.
 * Tekrarı zararsız; cluster'da aynı anda açılan süreçler kilitle sıraya girer.
 * Yeni bir tablo eklendiğinde bir sonraki açılışta kendiliğinden kapsanır.
 */
export async function installSyncCapture(
  dataSource: DataSource,
  log: (message: string) => void = () => undefined,
): Promise<number> {
  const tables = capturedTables(dataSource);
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.query(`SELECT pg_advisory_lock(hashtext('stocktrack.sync_capture'))`);
    await runner.query(FUNCTION_SQL);
    const existing: { table_name: string }[] = await runner.query(
      `SELECT c.relname AS table_name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = $1 AND NOT t.tgisinternal`,
      [TRIGGER],
    );
    const have = new Set(existing.map((r) => r.table_name));
    let created = 0;
    for (const table of tables) {
      if (have.has(table)) continue;
      await runner.query(
        `CREATE TRIGGER ${TRIGGER} AFTER INSERT OR UPDATE OR DELETE ON "${table}"
           FOR EACH ROW EXECUTE FUNCTION ${TRIGGER}()`,
      );
      created += 1;
    }
    if (created) log(`Eşitleme günlüğü: ${created} tabloya tetikleyici kuruldu (${tables.length} tablo izleniyor).`);
    return tables.length;
  } finally {
    await runner.query(`SELECT pg_advisory_unlock(hashtext('stocktrack.sync_capture'))`).catch(() => undefined);
    await runner.release();
  }
}
