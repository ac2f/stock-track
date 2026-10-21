#!/usr/bin/env node
/**
 * EŞİTLEME SÖZLEŞME TESTİ (docs/SYNC.md)
 *
 * Merkez sunucu ile yerel sunucu (SYNC_ROLE=replica) arasındaki protokolü uçtan
 * uca sınar. Gerçek eşitleme ajanı DEĞİLDİR — en kısa yoldan ajanın yapması
 * gerekenleri (ilk yükleme, değişiklik çekme, giden kutusunu gönderme, yerel
 * değişikliği geri alma) bir kez yapar ve sonuçları denetler. Ajanı yazan,
 * kendi programının da bu adımları geçtiğini bununla doğrulayabilir.
 *
 * Gerekenler: çalışan bir merkez ve BOŞ veritabanlı bir yerel sunucu.
 *
 *   PRIMARY_URL=http://localhost:3000/api/v1 \
 *   REPLICA_URL=http://localhost:3001/api/v1 \
 *   REPLICA_DB=postgres://stocktrack:stocktrack@localhost:5432/stocktrack_replica \
 *   OWNER_EMAIL=owner@stocktrack.local OWNER_PASSWORD=Owner123! \
 *   node scripts/sync-contract-test.mjs
 *
 * `pg` paketi backend/node_modules'ten alınır.
 */
import { createRequire } from 'module';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../backend/package.json'));
const { Client } = require('pg');

const PRIMARY = process.env.PRIMARY_URL ?? 'http://localhost:3000/api/v1';
const REPLICA = process.env.REPLICA_URL ?? 'http://localhost:3001/api/v1';
const REPLICA_DB = process.env.REPLICA_DB ?? 'postgres://stocktrack:stocktrack@localhost:5432/stocktrack_replica';
const OWNER = { email: process.env.OWNER_EMAIL ?? 'owner@stocktrack.local', password: process.env.OWNER_PASSWORD ?? 'Owner123!' };

let failures = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36).slice(-5);

async function http(base, method, path, { token, shop, body, replica } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['X-Shop-Id'] = shop;
  if (replica) h['X-Replica-Token'] = replica;
  const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data: data?.data ?? data, raw: data };
}
const P = (m, p, o) => http(PRIMARY, m, p, o);
const L = (m, p, o) => http(REPLICA, m, p, o);

const db = new Client({ connectionString: REPLICA_DB });
await db.connect();

// ── Ajanın yapacağı işlerin en kısa hali ────────────────────────────────
let schema;
const cols = new Map();

/** Merkezden gelen satırları yazar: günlüğe "yerel" diye düşmesin diye origin=upstream. */
async function applyRows(rows) {
  // rows: [{ table, op: 'upsert'|'delete', id, row }] — upsert bağımlılık sırasıyla, delete tersinden.
  const order = new Map(schema.tables.map((t) => [t.name, t.order]));
  const ups = rows.filter((r) => r.op === 'upsert').sort((a, b) => order.get(a.table) - order.get(b.table));
  const dels = rows.filter((r) => r.op === 'delete').sort((a, b) => order.get(b.table) - order.get(a.table));
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL stocktrack.sync_origin = 'upstream'`);
    for (const d of dels) await db.query(`DELETE FROM "${d.table}" WHERE id = $1`, [d.id]);
    for (const u of ups) {
      const c = cols.get(u.table).map((x) => `"${x}"`).join(', ');
      await db.query(
        `INSERT INTO "${u.table}" SELECT * FROM jsonb_populate_record(NULL::"${u.table}", $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET (${c}) = (SELECT ${cols.get(u.table).map((x) => `EXCLUDED."${x}"`).join(', ')})`,
        [JSON.stringify(u.row)],
      );
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

async function bootstrap(R) {
  const hello = (await P('GET', '/sync/hello', { replica: R })).data;
  schema = (await P('GET', '/sync/schema', { replica: R })).data;
  for (const t of schema.tables) cols.set(t.name, t.columns.map((c) => c.name));
  for (const t of schema.tables) {
    let after;
    for (;;) {
      const q = new URLSearchParams({ table: t.name, limit: '1000' });
      if (after) q.set('afterId', after);
      const page = (await P('GET', `/sync/snapshot?${q}`, { replica: R })).data;
      await applyRows(page.rows.map((row) => ({ table: t.name, op: 'upsert', id: row.id, row })));
      if (page.done) break;
      after = page.nextAfterId;
    }
  }
  await db.query(
    `INSERT INTO replica_state (id, upstream_url, upstream_server_id, last_seq, rebased_seq, snapshot_at, upstream_reachable, last_contact_at, agent_heartbeat_at, agent_version)
     VALUES (1, $1, $2, $3, (SELECT COALESCE(MAX(seq), 0) FROM sync_changes), now(), true, now(), now(), 'contract-test')
     ON CONFLICT (id) DO UPDATE SET upstream_url = EXCLUDED.upstream_url, upstream_server_id = EXCLUDED.upstream_server_id,
       last_seq = EXCLUDED.last_seq, rebased_seq = EXCLUDED.rebased_seq, snapshot_at = now(), upstream_reachable = true,
       last_contact_at = now(), agent_heartbeat_at = now(), agent_version = 'contract-test'`,
    [PRIMARY, hello.serverId, hello.seq],
  );
  await pull(R);
  return hello;
}

async function pull(R) {
  let [{ last_seq: since }] = (await db.query(`SELECT last_seq::text FROM replica_state WHERE id = 1`)).rows;
  for (let i = 0; i < 50; i++) {
    const page = (await P('GET', `/sync/changes?since=${since}&limit=1000`, { replica: R })).data;
    await applyRows(page.changes);
    since = page.lastSeq;
    await db.query(`UPDATE replica_state SET last_seq = $1, last_pull_at = now() WHERE id = 1`, [since]);
    if (!page.hasMore) break;
    if (page.waiting) await sleep(300);
  }
}

/** Giden kutusunu gönderir; sonuçları satırlara yazar. */
async function push(R) {
  const { rows } = await db.query(
    `SELECT id, actor, user_id, shop_id, method, path, body, occurred_at, created_ids, doc_nos
       FROM replica_outbox WHERE state = 'pending' ORDER BY seq LIMIT 100`,
  );
  if (!rows.length) return [];
  await db.query(`UPDATE replica_outbox SET state = 'pushing', attempts = attempts + 1, last_attempt_at = now() WHERE id = ANY($1)`, [rows.map((r) => r.id)]);
  const ops = rows.map((r) => ({
    opId: r.id, actor: r.actor, userId: r.user_id, shopId: r.shop_id, method: r.method, path: r.path,
    body: r.body, occurredAt: new Date(r.occurred_at).toISOString(), clientIds: r.created_ids, docNos: r.doc_nos,
  }));
  const res = await P('POST', '/sync/push', { replica: R, body: { ops } });
  for (const x of res.data.results) {
    const state = x.outcome === 'applied' || x.outcome === 'duplicate' ? 'applied' : x.outcome === 'rejected' ? 'rejected' : 'pending';
    await db.query(
      `UPDATE replica_outbox SET state = $2, upstream_status = $3, upstream_body = $4, error = $5, updated_at = now() WHERE id = $1`,
      [x.opId, state, x.httpStatus ?? null, JSON.stringify(x.body ?? null), x.error ?? null],
    );
  }
  await db.query(`UPDATE replica_state SET last_push_at = now(), last_contact_at = now() WHERE id = 1`);
  return res.data.results;
}

/**
 * Yerel değişiklikleri merkezdeki hale döndürür (rebase): yerelde değişen her
 * satır merkezden yeniden alınır; merkezde olmayan (reddedilen işlemin açtığı)
 * satırlar silinir. Yazmalar bu sırada duraklatılır.
 */
async function rebase(R) {
  await db.query(`UPDATE replica_state SET writes_paused_until = now() + interval '30 seconds' WHERE id = 1`);
  try {
    await sleep(300);
    for (let i = 0; i < 50; i++) {
      const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM replica_outbox WHERE state IN ('executing','pending','pushing')`);
      if (!rows[0].n) break;
      await push(R);
      await sleep(200);
    }
    const [{ rebased_seq }] = (await db.query(`SELECT COALESCE(rebased_seq, 0)::text AS rebased_seq FROM replica_state WHERE id = 1`)).rows;
    const { rows: local } = await db.query(
      `SELECT table_name, row_id::text, MAX(seq)::text AS seq FROM sync_changes WHERE seq > $1 GROUP BY table_name, row_id`,
      [rebased_seq],
    );
    const maxSeq = local.reduce((m, r) => (BigInt(r.seq) > m ? BigInt(r.seq) : m), BigInt(rebased_seq));
    const byTable = new Map();
    for (const r of local) {
      if (!cols.has(r.table_name)) continue;
      const list = byTable.get(r.table_name) ?? [];
      list.push(r.row_id);
      byTable.set(r.table_name, list);
    }
    const fix = [];
    for (const [table, ids] of byTable) {
      for (let i = 0; i < ids.length; i += 1000) {
        const res = (await P('POST', '/sync/rows', { replica: R, body: { table, ids: ids.slice(i, i + 1000) } })).data;
        fix.push(...res.rows.map((row) => ({ table, op: 'upsert', id: row.id, row })));
        fix.push(...res.missing.map((id) => ({ table, op: 'delete', id })));
      }
    }
    await applyRows(fix);
    await db.query(`UPDATE replica_state SET rebased_seq = $1 WHERE id = 1`, [maxSeq.toString()]);
    await pull(R);
    return fix;
  } finally {
    await db.query(`UPDATE replica_state SET writes_paused_until = NULL WHERE id = 1`);
  }
}

// ── Senaryo ────────────────────────────────────────────────────────────
const owner = (await P('POST', '/auth/login', { body: OWNER })).data.accessToken;
const me = (await P('GET', '/auth/me', { token: owner })).data;
const main = me.shops[0].id;
const shop = (await P('POST', '/shops', { token: owner, body: { name: `Sözleşme ${tag}`, copyFromShopId: main, copyCatalog: true } })).data.id;
const corelKey = (await P('POST', '/settings/corel/rotate', { token: owner, shop })).data.apiKey;
const plate = (await P('POST', '/plates/batch', { token: owner, shop, body: { items: [{ categoryName: `Vida${tag}`, measurementType: 'piece', name: `Vida ${tag}`, quantityInStock: 10 }] } })).data.plateIds[0];
const R = (await P('POST', '/sync/replicas', { token: owner, body: { name: `Sözleşme PC ${tag}`, shopIds: [shop] } })).data.token;

console.log('1) İlk yükleme');
// Yerel veritabanı önceki bir koşudan dolu olabilir: karşılaştırmalar bu andan sonrasına bakar.
const base = (await db.query(
  `SELECT (SELECT COALESCE(MAX(seq), 0) FROM sync_changes)::text AS changes,
          (SELECT COALESCE(MAX(seq), 0) FROM replica_outbox)::text AS outbox`,
)).rows[0];
const info0 = (await L('GET', '/system/info')).data;
ok(info0.role === 'replica', `yerel sunucu kipi: ${info0.role}`);
const hello = await bootstrap(R);
ok(hello.schemaHash === info0.schemaHash, `şema özetleri aynı (${hello.schemaHash})`);
ok((await L('GET', '/system/info')).data.ready === true, 'yerel sunucu hazır');
const { rows: [{ n: localPlates }] } = await db.query(`SELECT COUNT(*)::int AS n FROM material_plates WHERE id = $1`, [plate]);
ok(localPlates === 1, 'stok kalemi yerelde');
const { rows: [{ n: localChanges }] } = await db.query(`SELECT COUNT(*)::int AS n FROM sync_changes WHERE seq > $1`, [base.changes]);
ok(localChanges === 0, `merkezden yazılanlar yerel değişiklik sayılmadı (${localChanges})`);

console.log('2) Yerelde çalışma');
const lt = (await L('POST', '/auth/login', { body: OWNER })).data?.accessToken;
ok(!!lt, 'yerelde oturum açıldı (kullanıcılar ve parola özetleri yerelde)');
const cust = (await L('POST', '/customers', { token: lt, shop, body: { name: `Yerel Müşteri ${tag}` } })).data;
const sale = await L('POST', '/sales', { token: lt, shop, body: { buyerCustomerId: cust.id, items: [{ plateId: plate, quantity: 3, unitPrice: 20 }] } });
ok(sale.status === 201, `yerelde satış: ${sale.status}`);
const quote = (await L('POST', '/quotes', { token: lt, shop, body: { buyerCustomerId: cust.id, items: [{ lineKind: 'sale', itemName: 'Tabela', quantity: 1, unitPrice: 100, billingUnit: 'piece' }] } })).data;
ok(/^TKF-/.test(quote.quoteNo ?? ''), `yerelde teklif: ${quote.quoteNo}`);
const { rows: ob } = await db.query(`SELECT state, method, path, created_ids, doc_nos FROM replica_outbox WHERE seq > $1 ORDER BY seq`, [base.outbox]);
ok(ob.length === 3 && ob.every((o) => o.state === 'pending'), `giden kutusu: ${ob.map((o) => `${o.method} ${o.path}:${o.state}`).join(', ')}`);
ok(ob[1].created_ids.some((x) => x.table === 'sales') && ob[1].created_ids.some((x) => x.table === 'customer_ledger_entries'), 'satışta açılan kayıtlar not edildi');
ok(ob[2].doc_nos.quotes === quote.quoteNo, 'teklif numarası not edildi');
ok((await L('POST', '/users', { token: lt, body: { fullName: 'x', email: `x${tag}@x.x`, password: 'Xxxxxxx1!' } })).status === 409, 'kullanıcı yönetimi yerelde yapılmaz (409)');
ok((await L('POST', '/settings/corel/rotate', { token: lt, shop })).status === 409, 'anahtar üretimi yerelde yapılmaz (409)');
const ping = await fetch(`${REPLICA}/corel/ping`, { headers: { 'X-Api-Key': corelKey } });
ok(ping.status === 200, `Corel anahtarı yerelde geçerli: ${ping.status}`);
const hb = await fetch(`${REPLICA}/corel/runner/heartbeat`, { method: 'POST', headers: { 'X-Api-Key': corelKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ host: `PC-${tag}`, version: 't', pollSeconds: 30 }) });
const fo = await fetch(`${REPLICA}/corel/jobs/${quote.id}/folders`, { method: 'POST', headers: { 'X-Api-Key': corelKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ host: `PC-${tag}`, folder: 'D:\\Isler\\x' }) });
const { rows: ob2 } = await db.query(`SELECT actor, path FROM replica_outbox WHERE seq > $1 ORDER BY seq`, [base.outbox]);
ok(hb.status === 200 && !ob2.some((o) => o.path.includes('heartbeat')), 'runner nabzı giden kutusuna girmez');
ok(fo.status === 200 && ob2.some((o) => o.actor === 'corel' && o.path.includes('/folders')), 'runner klasör bildirimi girer (corel)');
const st = (await L('GET', '/system/sync', { token: lt })).data;
ok(st.role === 'replica' && st.outbox.pending >= 4 && st.agentRunning === true, `durum: ${JSON.stringify(st.outbox)}`);

console.log('3) Merkezde başka bir satış (çakışma hazırlığı)');
await P('POST', '/sales', { token: owner, shop, body: { buyerCustomerId: (await P('POST', '/customers', { token: owner, shop, body: { name: `Merkez Müşteri ${tag}` } })).data.id, items: [{ plateId: plate, quantity: 5, unitPrice: 20 }] } });
// Yerelde stok 7 görünüyor; merkezde 5 kaldı. Yerelde 6 satılırsa merkezde reddedilir.
const late = await L('POST', '/sales', { token: lt, shop, body: { buyerCustomerId: cust.id, items: [{ plateId: plate, quantity: 6, unitPrice: 20 }] } });
ok(late.status === 201, 'yerelde (eski stokla) satış kabul edildi');

console.log('4) Gönderme ve geri alma');
const results = await push(R);
ok(results.filter((r) => r.outcome === 'applied').length === 4, `uygulanan: ${results.map((r) => r.outcome).join(',')}`);
const rej = results.find((r) => r.outcome === 'rejected');
ok(rej && /stok/i.test(rej.error), `merkezde reddedilen: ${rej?.error}`);
const pc = await P('GET', `/customers/${cust.id}`, { token: owner, shop });
ok(pc.status === 200, 'yerel müşteri merkezde AYNI kimlikle');
const pq = await P('GET', `/quotes/${quote.id}`, { token: owner, shop });
ok(pq.data.quoteNo === quote.quoteNo, `teklif numarası korundu: ${pq.data.quoteNo}`);
ok(pq.data.foldersPath === 'D:\\Isler\\x', 'runner bildirimi merkezde');
const fix = await rebase(R);
ok(fix.length > 0, `geri alınan/düzeltilen satır: ${fix.length}`);
const { rows: [lp] } = await db.query(`SELECT quantity_in_stock::int AS q FROM material_plates WHERE id = $1`, [plate]);
const { rows: [pp] } = { rows: [(await P('GET', `/plates?search=Vida ${tag}`, { token: owner, shop })).data.items[0]] };
ok(lp.q === Number(pp.quantityInStock) && lp.q === 2, `stok yerel = merkez: ${lp.q} / ${pp.quantityInStock}`);
const { rows: [lc] } = await db.query(`SELECT current_balance::numeric AS b FROM customers WHERE id = $1`, [cust.id]);
const pcb = (await P('GET', `/customers/${cust.id}`, { token: owner, shop })).data.currentBalance;
ok(Number(lc.b) === Number(pcb), `cari bakiye yerel = merkez: ${lc.b} / ${pcb}`);
const { rows: [{ n: dup }] } = await db.query(`SELECT COUNT(*)::int AS n FROM sales WHERE buyer_customer_id = $1`, [cust.id]);
ok(dup === 1, `yerelde mükerrer/eksik satış yok (reddedilen geri alındı): ${dup}`);

console.log('5) Kişinin kararı');
const open = (await L('GET', '/system/sync/outbox?limit=100', { token: lt })).data;
const mineRej = open.items.find((o) => o.id === rej?.opId);
ok(mineRej && mineRej.state === 'rejected' && /stok/i.test(mineRej.error ?? ''), 'reddedilen işlem nedeniyle listede');
const rejBefore = (await L('GET', '/system/sync', { token: lt })).data.outbox.rejected;
const d = await L('POST', `/system/sync/outbox/${rej?.opId}/discard`, { token: lt });
ok(d.status === 200 && d.data.state === 'discarded', 'vazgeçildi');
ok((await L('GET', '/system/sync', { token: lt })).data.outbox.rejected === rejBefore - 1, 'karar bekleyenlerden düştü');

console.log('6) Merkezden gelen değişiklik yerele iner');
const remote = (await P('POST', '/customers', { token: owner, shop, body: { name: `Uzak ${tag}` } })).data;
await sleep(200);
await pull(R);
const { rows: [{ n: got }] } = await db.query(`SELECT COUNT(*)::int AS n FROM customers WHERE id = $1`, [remote.id]);
ok(got === 1, 'merkezde açılan müşteri yerelde');
const seen = (await L('GET', `/customers/${remote.id}`, { token: lt, shop })).data;
ok(seen?.name === `Uzak ${tag}`, 'yerel arayüz görür');

await db.end();
await P('PATCH', `/shops/${shop}`, { token: owner, body: { isActive: false } });
console.log(failures ? `\n${failures} HATA` : '\nSözleşme testi geçti');
process.exit(failures ? 1 : 0);
