// Kırmızı takım 2: başka işletmenin KAYITLARINA kimlikle erişme / başkası adına işlem yapma denemeleri.
// A işletmesi gerçek kayıtlar açar; B işletmesinin yöneticisi bunların kimliklerini bilerek okumaya, değiştirmeye,
// silmeye ve kendi kayıtlarına bağlamaya çalışır. Hiçbiri başarılı olmamalı; A'nın verisi bozulmamalı.
//
// Çalıştırma: API=http://localhost:3000/api/v1 node test-e2e/idor.e2e.mjs
import { createHmac } from 'node:crypto';
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
const tag = Date.now().toString(36).slice(-5);
const owner = await login('owner@stocktrack.local', 'Owner123!');
const label = (await call('POST', '/platform/labels', { token: owner, body: { name: `Idor ${tag}`, description: 'x' } })).data;
async function biz(name) {
  const email = `${name.toLowerCase()}${tag}@ornek.test`;
  const r = await call('POST', '/registration', { body: { businessName: `${name} ${tag}`, ownerName: `${name} Sahibi`, email, phone: '05321112233', password: 'Parola-12345', province: 'İstanbul', district: 'Kadıköy', labelIds: [label.id], acceptTerms: true } });
  await call('POST', `/platform/businesses/${r.data.shop.id}/approve`, { token: owner });
  const token = await login(email, 'Parola-12345');
  const me = (await call('GET', '/auth/me', { token })).data;
  return { email, shop: r.data.shop.id, token, userId: me.id };
}
const A = await biz('IdorA');
const B = await biz('IdorB');
const asA = (m, p, body) => call(m, p, { token: A.token, shop: A.shop, body });
const asB = (m, p, body) => call(m, p, { token: B.token, shop: B.shop, body });
const notOk = (r) => r.status < 200 || r.status >= 300;

console.log('1) A işletmesi kayıtlarını açar');
const cust = (await asA('POST', '/customers', { name: 'A Müşterisi' })).data;
const supp = (await asA('POST', '/suppliers', { name: 'A Tedarikçisi' })).data;
const veh = (await asA('POST', '/vehicles', { plateNumber: '34 AB 123', name: 'A Aracı' })).data;
const bank = (await asA('POST', '/bank-accounts', { bankName: 'Banka', accountName: 'A Hesap', iban: 'TR000000000000000000000001' })).data;
const wh = (await asA('GET', '/warehouses')).data?.[0] ?? (await asA('POST', '/warehouses', { name: 'A Depo', code: 'AD1' })).data;
const platesRes = await asA('POST', '/plates/batch', { items: [{ categoryName: 'Pleksi', templateName: 'A Pleksi', name: 'A Levha', measurementType: 'area', widthMm: 1000, heightMm: 1000, quantityInStock: 5, thicknessMm: 3, sheetWidthMm: 1000, sheetHeightMm: 1000 }] });
const plate = platesRes.data?.plateIds?.[0] ? { id: platesRes.data.plateIds[0] } : undefined;
const pay = (await asA('POST', `/customers/${cust.id}/payments`, { amount: 50, method: 'cash', receivedById: A.userId })).data;
const quote = (await asA('POST', '/quotes', { buyerCustomerId: cust.id, items: plate?.id ? [{ lineKind: 'sale', plateId: plate.id, quantity: 1, unitPrice: 10 }] : [] }));
ok(cust?.id && supp?.id && veh?.id && bank?.id && wh?.id, `müşteri/tedarikçi/araç/banka/depo açıldı`);
ok(!!plate?.id, `plaka açıldı (${platesRes.status}) ${plate?.id ? '' : platesRes.raw.slice(0, 160)}`);
ok(pay?.payment?.id || pay?.id, `ödeme alındı`);
const quoteId = quote.data?.id;

console.log('2) B yöneticisi A kayıtlarını kimlikle okuyup değiştirmeye/silmeye çalışır');
const targets = [
  ['customers', cust?.id], ['suppliers', supp?.id], ['vehicles', veh?.id], ['bank-accounts', bank?.id],
  ['warehouses', wh?.id], ['plates', plate?.id], ['quotes', quoteId],
].filter(([, id]) => id);
for (const [base, id] of targets) {
  const g = await asB('GET', `/${base}/${id}`);
  ok(g.status === 404 || g.status === 403, `GET /${base}/:id → ${g.status}`);
  const p = await asB('PATCH', `/${base}/${id}`, { name: 'ELE GEÇİRİLDİ', note: 'x' });
  ok(notOk(p), `PATCH /${base}/:id → ${p.status}`);
  const d = await asB('DELETE', `/${base}/${id}`);
  ok(notOk(d), `DELETE /${base}/:id → ${d.status}`);
}
const stillThere = await asA('GET', `/customers/${cust.id}`);
ok(stillThere.status === 200 && stillThere.data.name === 'A Müşterisi', 'A müşterisi bozulmadı');
const listB = await asB('GET', '/customers?limit=100');
ok(!JSON.stringify(listB.data).includes(cust.id), 'B müşteri listesinde A müşterisi yok');
const searchB = await asB('GET', '/customers?search=A%20M%C3%BC%C5%9Fterisi');
ok(!JSON.stringify(searchB.data).includes(cust.id), 'B aramasında A müşterisi çıkmaz');

console.log('3) Alt kaynaklar ve işlemler');
for (const [m, p, body] of [
  ['GET', `/customers/${cust.id}/payments`], ['POST', `/customers/${cust.id}/payments`, { amount: 1, method: 'cash', receivedById: B.userId }],
  ['GET', `/customers/${cust.id}/ledger`], ['POST', `/customers/${cust.id}/portal-token`], ['POST', `/customers/${cust.id}/discount`, { amount: 1 }],
  ['POST', `/customers/${cust.id}/settle`, { amount: 1 }], ['GET', `/customers/${cust.id}/statement`],
  ['GET', `/documents/customers/${cust.id}/statement.pdf`], ['GET', `/customer-network/customers/${cust.id}`],
  ...(plate?.id ? [['GET', `/plates/${plate.id}/stock-levels`], ['PUT', `/plates/${plate.id}/retail-price`, { price: 1, currency: 'TRY' }], ['POST', `/plates/${plate.id}/deplete`, {}], ['GET', `/plates/${plate.id}/pricing`]] : []),
  ...(quoteId ? [['POST', `/quotes/${quoteId}/convert`, {}], ['PATCH', `/quotes/${quoteId}/status`, { status: 'approved' }], ['GET', `/documents/quotes/${quoteId}/pdf`]] : []),
  ['GET', `/payments?receivedById=${A.userId}`],
]) {
  const r = await asB(m, p, body);
  const leaked = r.status >= 200 && r.status < 300 && /A Müşterisi|A Levha|A Hesap/.test(r.raw);
  ok(!leaked && r.status < 500, `${m} ${p.slice(0, 60)} → ${r.status}`);
}
const bPay = await asB('GET', '/payments');
ok(!JSON.stringify(bPay.data).includes(A.userId), 'B ödeme listesinde A\'nın çalışanı yok');

console.log('4) B, kendi kaydını A\'nın kaydına BAĞLAMAYA çalışır (çapraz referans)');
const custB = (await asB('POST', '/customers', { name: 'B Müşterisi' })).data;
const tries = [
  ['quote → A müşterisi', 'POST', '/quotes', { buyerCustomerId: cust.id, items: [] }],
  ['sale → A müşterisi', 'POST', '/sales', { buyerCustomerId: cust.id, items: plate?.id ? [{ plateId: plate.id, quantity: 1, unitPrice: 1 }] : [] }],
  ['purchase → A tedarikçisi', 'POST', '/purchases', { supplierId: supp.id, warehouseId: wh.id, items: [] }],
  ['ödeme → A bankası', 'POST', `/customers/${custB.id}/payments`, { amount: 1, method: 'bank_transfer', bankAccountId: bank.id }],
  ['ödeme → A çalışanı', 'POST', `/customers/${custB.id}/payments`, { amount: 1, method: 'cash', receivedById: A.userId }],
  ['müşteri güncelle', 'PATCH', `/customers/${custB.id}`, { name: 'x', linkedShopId: A.shop }],
  ['kuyruk → A plakası', 'POST', '/processing', { plateId: plate?.id ?? wh.id, customerId: custB.id, quantity: 1, widthMm: 100, heightMm: 100 }],
  ['gider → A projesi', 'POST', '/expenses', { amount: 1, projectId: wh.id, categoryId: wh.id }],
];
for (const [name, m, p, body] of tries) {
  const r = await asB(m, p, body);
  ok(notOk(r), `${name} → ${r.status}`);
}
const aAfter = await asA('GET', `/customers/${cust.id}`);
ok(aAfter.data?.currentBalance !== undefined && Number(aAfter.data.currentBalance) === Number((await asA('GET', `/customers/${cust.id}`)).data.currentBalance), 'A bakiyesi değişmedi');

console.log('5) Kimlik/başlık oyunları');
const hdrs = [
  ['geçersiz X-Shop-Id', { token: B.token, shop: 'abc' }],
  ['olmayan X-Shop-Id', { token: B.token, shop: '00000000-0000-4000-8000-000000000bad' }],
  ['A dükkânı + B jetonu', { token: B.token, shop: A.shop }],
];
for (const [name, opts] of hdrs) {
  const r = await call('GET', '/customers', opts);
  ok(r.status === 400 || r.status === 403, `${name} → ${r.status}`);
}
const refresh = (await call('POST', '/auth/login', { body: { email: B.email, password: 'Parola-12345' } })).data.refreshToken;
ok((await call('GET', '/customers', { token: refresh, shop: B.shop })).status === 401, 'yenileme jetonu erişim jetonu yerine geçmez');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: B.userId, role: 'owner', email: B.email, fullName: 'x' })}.`;
ok((await call('GET', '/platform/businesses', { token: forged })).status === 401, 'alg=none jetonu reddedilir');
const parts = B.token.split('.');
const tampered = `${parts[0]}.${b64({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), role: 'owner' })}.${parts[2]}`;
ok((await call('GET', '/platform/businesses', { token: tampered })).status === 401, 'rolü değiştirilmiş jeton reddedilir');
const wrongKey = createHmac('sha256', 'baska-anahtar').update(`${parts[0]}.${parts[1]}`).digest('base64url');
ok((await call('GET', '/auth/me', { token: `${parts[0]}.${parts[1]}.${wrongKey}` })).status === 401, 'yanlış anahtarla imzalı jeton reddedilir');
ok((await call('GET', '/auth/me', { token: 'x.y.z' })).status === 401, 'bozuk jeton reddedilir');

console.log('6) Yetki yükseltme: B yöneticisi kendi üyeliğini/rolünü yükseltmeye çalışır');
const bMembers = (await call('GET', `/shops/${B.shop}/members`, { token: B.token })).data;
const self = bMembers.find((m) => m.userId === B.userId);
ok((await call('PATCH', `/shops/${B.shop}/members/${self.id}`, { token: B.token, body: { isAdmin: true } })).status === 403, 'kendi üyeliğini değiştiremez');
ok((await call('PATCH', `/users/${B.userId}`, { token: B.token, body: { role: 'owner' } })).status === 403, 'kendi rolünü sistem sahibi yapamaz');
ok((await call('POST', '/users', { token: B.token, body: { fullName: 'Kötü', email: `kotu${tag}@x.test`, password: 'Parola-12345', role: 'owner' } })).status === 403, 'sistem sahibi hesabı açamaz');
ok((await call('POST', '/shops', { token: B.token, body: { name: 'Sahte' } })).status === 403, 'dükkân açamaz');
ok((await call('PATCH', `/shops/${A.shop}`, { token: B.token, body: { isActive: false } })).status === 403, 'başkasının dükkânını kapatamaz');
ok((await call('POST', `/shops/${A.shop}/members`, { token: B.token, body: { newUser: { fullName: 'Casus', email: `casus${tag}@x.test`, password: 'Parola-12345' }, permissions: {} } })).status === 403, 'A ekibine kişi ekleyemez');
ok((await call('GET', `/shops/${A.shop}/members`, { token: B.token })).status === 403, 'A ekibini listeleyemez');
// B kendi dükkân adresini kullanıp A'nın üyelik kimliğini hedefler (kimlik başka dükkânın)
const aMembers = (await call('GET', `/shops/${A.shop}/members`, { token: A.token })).data;
const aSelf = aMembers.find((m) => m.userId === A.userId);
for (const [m, p, body] of [
  ['PATCH', `/shops/${B.shop}/members/${aSelf.id}`, { isAdmin: false }],
  ['PATCH', `/shops/${B.shop}/members/${aSelf.id}/account`, { password: 'Hacklendi-123', isActive: false }],
  ['DELETE', `/shops/${B.shop}/members/${aSelf.id}`],
]) {
  const r = await call(m, p, { token: B.token, body });
  ok(r.status === 404 || r.status === 403, `${m} üyelik kimliği başka dükkânın → ${r.status}`);
}
ok((await login(A.email, 'Parola-12345')) !== undefined, 'A yöneticisi hâlâ eski parolayla girebiliyor');
const mass = await call('PATCH', `/business-profile`, { token: B.token, shop: B.shop, body: { status: 'active', plan: 'bedava', subscriptionUntil: '2099-01-01', features: { corel: true }, isActive: true } });
ok(mass.status === 400, `kiralama/özellik alanları profil ucundan yazılamaz (toplu atama): ${mass.status}`);
const feat = await call('PATCH', `/platform/businesses/${B.shop}`, { token: B.token, body: { features: { corel: true } } });
ok(feat.status === 403, 'özelliği kendi açamaz');

console.log(failures ? `\n${failures} DENEME BAŞARISIZ` : '\nHepsi geçti ✔');
process.exit(failures ? 1 : 0);
