import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { Client } from 'pg';

const run = promisify(execFile);

/**
 * Yükseltme işaretleri: bir veritabanında bu sütunlardan biri YOKSA ama veri varsa, uygulama
 * bu sürümle ilk kez açılıyor demektir (şema açılışta eklenir). Yeni bir sürüm şemayı değiştirirse
 * buraya yeni bir satır eklenir; eski satırlar kalır (hiç yükseltilmemiş veritabanı da yakalansın).
 */
export const UPGRADE_MARKERS: { table: string; column: string; what: string }[] = [
  { table: 'shops', column: 'status', what: 'çok işletmeli kiralama (platform) şeması' },
];

export interface UpgradeProbe {
  /** Veritabanında kullanıcı kaydı var mı (yani gerçek veri). */
  hasData: boolean;
  /** Eksik işaretlerin açıklamaları; boşsa şema güncel. */
  missing: string[];
}

/** Saf karar: veri varsa ve işaretlerden biri eksikse yükseltme bekliyordur. */
export function upgradePending(p: UpgradeProbe): boolean {
  return p.hasData && p.missing.length > 0;
}

export type PreUpgradeBackupMode = 'auto' | 'off' | 'required';

export interface PreUpgradeBackupResult {
  /** Bu açılışta şema yükseltilecek mi (yedek alınsın ya da alınmasın). */
  pending: boolean;
  status: 'skipped' | 'done' | 'failed';
  file?: string;
  reason?: string;
}

export function backupMode(value: string | undefined): PreUpgradeBackupMode {
  const v = (value ?? 'auto').trim().toLowerCase();
  return v === 'off' || v === 'required' ? v : 'auto';
}

async function probe(client: Client): Promise<UpgradeProbe> {
  const users = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'`,
  );
  if (!users.rowCount) return { hasData: false, missing: [] };
  const count = await client.query('SELECT COUNT(*)::int AS n FROM "users"');
  const hasData = Number(count.rows[0]?.n) > 0;
  const missing: string[] = [];
  for (const m of UPGRADE_MARKERS) {
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [m.table, m.column],
    );
    if (!col.rowCount) missing.push(m.what);
  }
  return { hasData, missing };
}

/**
 * Şema güncellenmeden ÖNCE (NestFactory.create şemayı eşitler) veritabanının tam yedeğini alır.
 *
 * Yükseltmeler yalnız ekleme yapar (yeni tablo/sütun, varsayılanlı) ve veri silmez; yine de
 * "veri kaybı olmasın" için, veri olan bir veritabanı ilk kez yükseltilirken `pg_dump` ile
 * `<BACKUP_DIR>/pre-upgrade-<veritabanı>-<zaman>.sql` yazılır. Geri dönmek gerekirse:
 * `psql … -f pre-upgrade-….sql` (dosya --clean içerir).
 *
 * PRE_UPGRADE_BACKUP: auto (varsayılan; yedek alınamazsa uyarır ve devam eder), required
 * (alınamazsa uygulama AÇILMAZ), off.
 */
export async function preUpgradeBackup(
  env: NodeJS.ProcessEnv = process.env,
  log: (m: string) => void = (m) => console.log(m),
): Promise<PreUpgradeBackupResult> {
  const mode = backupMode(env.PRE_UPGRADE_BACKUP);
  if (env.SYNC_ROLE === 'replica') return { pending: false, status: 'skipped', reason: 'yerel sunucu (replika)' };

  const db = {
    host: env.DB_HOST ?? 'localhost',
    port: parseInt(env.DB_PORT ?? '5432', 10),
    user: env.DB_USERNAME ?? 'stocktrack',
    password: env.DB_PASSWORD ?? 'stocktrack',
    database: env.DB_NAME ?? 'stocktrack',
  };
  const client = new Client(db);
  let state: UpgradeProbe;
  try {
    await client.connect();
    state = await probe(client);
  } catch (err) {
    // Veritabanına ulaşılamıyorsa asıl açılış zaten aynı hatayı verir; burada engel olmayalım.
    return { pending: false, status: 'skipped', reason: `veritabanı okunamadı: ${(err as Error).message}` };
  } finally {
    await client.end().catch(() => undefined);
  }
  if (!upgradePending(state)) return { pending: false, status: 'skipped', reason: 'şema güncel ya da veri yok' };
  const what = state.missing.join(', ');
  if (mode === 'off') {
    log(`⚠ Veritabanı yükseltilecek (${what}); PRE_UPGRADE_BACKUP=off: yedek alınmadı.`);
    return { pending: true, status: 'skipped', reason: 'PRE_UPGRADE_BACKUP=off' };
  }

  const dir = path.isAbsolute(env.BACKUP_DIR ?? '') ? env.BACKUP_DIR! : path.join(process.cwd(), env.BACKUP_DIR || 'backups');
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const file = path.join(dir, `pre-upgrade-${db.database}-${stamp}.sql`);
  const bin = env.BACKUP_PG_BIN_DIR ? path.join(env.BACKUP_PG_BIN_DIR, 'pg_dump') : 'pg_dump';
  try {
    await fs.mkdir(dir, { recursive: true });
    log(`Veritabanı yükseltilecek (${what}). Önce tam yedek alınıyor: ${file}`);
    await run(
      bin,
      ['-h', db.host, '-p', String(db.port), '-U', db.user, '-d', db.database, '--no-owner', '--no-privileges', '--clean', '--if-exists', '-f', file],
      { env: { ...env, PGPASSWORD: db.password }, timeout: 15 * 60_000, maxBuffer: 1024 * 1024 },
    );
    const { size } = await fs.stat(file);
    if (size < 100) throw new Error('yedek dosyası boş');
    log(`✓ Yükseltme öncesi yedek hazır (${(size / 1024).toFixed(0)} KB). Geri dönmek için: psql -f ${path.basename(file)}`);
    return { pending: true, status: 'done', file };
  } catch (err) {
    await fs.unlink(file).catch(() => undefined);
    const reason = (err as Error).message;
    log(`✗ YEDEK ALINAMADI (${reason}). pg_dump kurulu ve ${dir} yazılabilir mi?`);
    if (mode === 'required') {
      throw new Error(`Yükseltme öncesi yedek alınamadı ve PRE_UPGRADE_BACKUP=required: ${reason}`);
    }
    log('  Şema değişiklikleri yalnız ekleme yapar (veri silinmez); açılışa devam ediliyor.');
    return { pending: true, status: 'failed', reason };
  }
}
