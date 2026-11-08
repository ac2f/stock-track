// Eşzamanlılık: aynı stoğa paralel satışlar fazla satış (oversell) yaratmaz; ilk stok girişi çift satır açmaz.
// Çalıştırma: API=http://localhost:3000/api/v1 [E2E_PSQL='psql ...'] node test-e2e/concurrency.e2e.mjs
import { execSync } from 'node:child_process';
const BASE = process.env.API ?? 'http://localhost:3000/api/v1';
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
async function call(method, path, { token, shop, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d?.data ?? d, raw: t };
}
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.accessToken;
const psql = (sql) => (process.env.E2E_PSQL ? execSync(`${process.env.E2E_PSQL} -At -c "${sql}"`, { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? 'x' } }).toString().trim() : null);
const tag = Date.now().toString(36).slice(-5);
const owner = await login('owner@stocktrack.local', 'Owner123!');
const label = (await call('POST', '/platform/labels', { token: owner, body: { name: `Eşz ${tag}`, description: 'x' } })).data;
const email = `esz${tag}@ornek.test`;
const reg = await call('POST', '/registration', { body: { businessName: `Esz ${tag}`, ownerName: 'Esz Sahibi', email, phone: '05321112233', password: 'Parola-12345', province: 'İstanbul', district: 'Kadıköy', labelIds: [label.id], acceptTerms: true } });
const shop = reg.data.shop.id;
await call('POST', `/platform/businesses/${shop}/approve`, { token: owner });
const token = await login(email, 'Parola-12345');
const as = (m, p, body) => call(m, p, { token, shop, body });

// Adet (piece) bazlı malzeme: 5 adet stok
const mk = await as('POST', '/plates/batch', { items: [{ categoryName: 'Diğer', templateName: `Vida ${tag}`, measurementType: 'piece', quantityInStock: 5, name: `Vida ${tag}` }] });
const pid = mk.data?.plateIds?.[0];
ok(!!pid, `kalem açıldı (5 adet): ${mk.status}`);
const cust = (await as('POST', '/customers', { name: `Müşteri ${tag}`, phone: '05329998877' })).data;
ok(!!cust?.id, 'müşteri açıldı');

console.log('1) 12 paralel satış × 1 adet → tam 5 başarılı, stok 0, eksiye düşmez');
const sells = await Promise.all(
  Array.from({ length: 12 }, () => as('POST', '/sales', { buyerCustomerId: cust.id, items: [{ plateId: pid, quantity: 1, unitPrice: 10 }] })),
);
const good = sells.filter((r) => r.status === 201).length;
const rejected = sells.filter((r) => r.status === 400 || r.status === 409).length;
ok(good === 5, `başarılı satış: ${good} (beklenen 5)`);
ok(good + rejected === 12, `diğerleri düzgünce reddedildi: ${rejected} (5xx yok: ${sells.every((r) => r.status < 500)})`);
const after = (await as('GET', `/plates/${pid}`)).data;
const left = Number(after?.quantityInStock ?? 0);
ok(left === 0, `kalan stok: ${left} (eksiye düşmedi)`);
const bal = (await as('GET', `/customers/${cust.id}`)).data;
ok(Number(bal.currentBalance) === 50, `müşteri borcu 5 × 10 = ${bal.currentBalance}`);

console.log('2) Aynı kalem için eşzamanlı ilk stok girişi çift stok satırı açmaz');
const mk2 = await as('POST', '/plates/batch', { items: [{ categoryName: 'Diğer', templateName: `Cıvata ${tag}`, measurementType: 'piece', quantityInStock: 0, name: `Cıvata ${tag}` }] });
const pid2 = mk2.data?.plateIds?.[0];
const wh = (await as('GET', '/warehouses')).data;
const whId = (wh.items ?? wh)[0].id;
// 8 paralel alış (stok girişi): her biri 3 adet
const sup = (await as('POST', '/suppliers', { name: `Tedarikçi ${tag}` })).data;
const buys = await Promise.all(
  Array.from({ length: 8 }, () => as('POST', '/purchases', { supplierId: sup.id, warehouseId: whId, items: [{ plateId: pid2, quantity: 3, unitPrice: 4 }] })),
);
ok(buys.every((r) => r.status === 201), `alışlar: ${buys.map((r) => r.status).join(',')}`);
const total = Number((await as('GET', `/plates/${pid2}`)).data.quantityInStock);
ok(total === 24, `toplam stok 8 × 3 = ${total}`);
const rows = psql(`select count(*) from stock_levels where plate_id='${pid2}' and owner_customer_id is null and deleted_at is null`);
if (rows !== null) ok(rows === '1', `işletme stok satırı sayısı: ${rows} (tek olmalı)`);

console.log(failures ? `\n${failures} adım BAŞARISIZ` : '\nHepsi geçti ✔');
process.exit(failures ? 1 : 0);
