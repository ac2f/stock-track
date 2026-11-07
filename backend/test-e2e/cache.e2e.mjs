// Redis önbelleği: isabet/ıska, her yazma yolunda kendiliğinden geçersiz kılma, dükkân yalıtımı, erişim önbelleği.
// Redis açık bir API ister (REDIS_URL). Çalıştırma: node test-e2e/cache.e2e.mjs
const BASE = process.env.API ?? 'http://localhost:3000/api/v1';
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
async function call(method, path, { token, shop, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d?.data ?? d, raw: d, xcache: res.headers.get('x-cache') };
}
const owner = (await call('POST', '/auth/login', { body: { email: 'owner@stocktrack.local', password: 'Owner123!' } })).data.accessToken;
const me = (await call('GET', '/auth/me', { token: owner })).data;
const A = me.shops[0].id; const B = me.shops.find((s) => s.id !== A && s.isActive).id;
const tag = Date.now().toString(36).slice(-5);

console.log('1) Katalog listesi: ilk MISS, sonra HIT, yazınca MISS (save yolu)');
await call('POST', '/system/cache/flush', { token: owner });
let r = await call('GET', '/material-categories', { token: owner, shop: A });
ok(r.status === 200 && r.xcache === 'MISS', `ilk okuma MISS: ${r.xcache}`);
const n0 = r.data.length;
r = await call('GET', '/material-categories', { token: owner, shop: A });
ok(r.xcache === 'HIT' && r.data.length === n0, `ikinci okuma HIT: ${r.xcache}`);
const c = await call('POST', '/material-categories', { token: owner, shop: A, body: { name: `Kat${tag}`, code: `K${tag}`, defaultMeasurementType: 'area' } });
ok(c.status === 201, `kategori eklendi: ${c.status}`);
r = await call('GET', '/material-categories', { token: owner, shop: A });
ok(r.xcache === 'MISS' && r.data.length === n0 + 1 && r.data.some((x) => x.name === `Kat${tag}`), `yazıdan sonra MISS + yeni kayıt görünür: ${r.xcache} ${r.data.length}`);

console.log('2) Dükkân yalıtımı: B dükkânı A\'nın önbelleğini görmez');
r = await call('GET', '/material-categories', { token: owner, shop: B });
ok(r.xcache === 'MISS' && !r.data.some((x) => x.name === `Kat${tag}`), `B ilk okuma MISS ve A'nın kaydı yok: ${r.xcache}`);

console.log('3) update()/ham SQL yolları da siler (aboneye uğramayan yazılar)');
const catId = c.data.id;
await call('GET', '/material-categories', { token: owner, shop: A }); // HIT
const up = await call('PATCH', `/material-categories/${catId}`, { token: owner, shop: A, body: { name: `Kat${tag}x` } });
r = await call('GET', '/material-categories', { token: owner, shop: A });
ok(up.status === 200 && r.xcache === 'MISS' && r.data.some((x) => x.name === `Kat${tag}x`), `güncelleme sonrası yeni ad: ${r.data.find((x) => x.id === catId)?.name}`);

console.log('4) Stok listesi: dükkânlar arası satış sonrası satan dükkânın listesi taze');
const brand = `Cb${tag}`;
const intake = await call('POST', '/plates/batch', { token: owner, shop: A, body: { items: [
  { categoryName: `Vida${tag}`, measurementType: 'piece', name: `Vida ${tag}`, quantityInStock: 50 }] } });
const plateId = intake.data.plateIds[0];
r = await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A });
ok(Number(r.data.items.find((p) => p.id === plateId)?.quantityInStock) === 50, 'stok 50');
await new Promise((res) => setTimeout(res, 500)); // stok girişinin ardından çalışan olay işleyicileri yazıyor olabilir
await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A });
r = await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A });
ok(r.xcache === 'HIT', `sonraki okuma HIT: ${r.xcache}`);
const tr = await call('POST', '/shop-transfers', { token: owner, shop: A, body: { toShopId: B, items: [{ plateId, quantity: 20, unitPrice: 3 }] } });
ok(tr.status === 201, `satış: ${tr.status}`);
r = await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A });
ok(r.xcache === 'MISS' && Number(r.data.items.find((p) => p.id === plateId)?.quantityInStock) === 30, `satan dükkânda stok 30 (önbellek bayat değil): ${r.data.items.find((p) => p.id === plateId)?.quantityInStock} ${r.xcache}`);
const rb = await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: B });
ok(Number(rb.data.items[0]?.quantityInStock) === 20, `alan dükkânda 20: ${rb.data.items[0]?.quantityInStock}`);
// iptal → geri gelir
const cancel = await call('POST', `/shop-transfers/${tr.data.id}/cancel`, { token: owner, shop: A });
r = await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A });
ok(cancel.status === 201 && Number(r.data.items.find((p) => p.id === plateId)?.quantityInStock) === 50, `iptalde 50'ye döndü: ${r.data.items.find((p) => p.id === plateId)?.quantityInStock}`);

console.log('5) Geri alınan işlem önbelleği boşaltmaz, hatalı istek bayat veri bırakmaz');
r = await call('GET', '/reports/dashboard', { token: owner, shop: A });
ok(r.status === 200, 'dashboard okundu');
r = await call('GET', '/reports/dashboard', { token: owner, shop: A });
ok(r.xcache === 'HIT', `dashboard HIT: ${r.xcache}`);
const bad = await call('POST', '/shop-transfers', { token: owner, shop: A, body: { toShopId: A, items: [{ plateId, quantity: 1, unitPrice: 1 }] } });
r = await call('GET', '/reports/dashboard', { token: owner, shop: A });
ok(bad.status === 400 && r.xcache === 'HIT', `başarısız yazı HIT'i bozmadı: ${bad.status} ${r.xcache}`);

console.log('6) Oturum/erişim önbelleği: üye pasife alınınca anında etkili');
const mem = await call('POST', `/shops/${A}/members`, { token: owner, body: { newUser: { fullName: `Önbellek ${tag}`, email: `cache${tag}@test.local`, password: 'Cache1234!' }, isAdmin: false, permissions: { stock: { read: true, write: false } } } });
ok(mem.status === 201, `üye eklendi: ${mem.status} ${JSON.stringify(mem.raw).slice(0,120)}`);
const tok = (await call('POST', '/auth/login', { body: { email: `cache${tag}@test.local`, password: 'Cache1234!' } })).data.accessToken;
let s1 = await call('GET', '/warehouses', { token: tok, shop: A });
ok(s1.status === 200, `üye depoları görür: ${s1.status}`);
s1 = await call('GET', '/warehouses', { token: tok, shop: A });
ok(s1.status === 200 && s1.xcache === 'HIT', `HIT: ${s1.xcache}`);
const members = await call('GET', `/shops/${A}/members`, { token: owner });
const m = members.data.find((x) => x.email === `cache${tag}@test.local`);
const del = await call('DELETE', `/shops/${A}/members/${m.id}`, { token: owner });
s1 = await call('GET', '/warehouses', { token: tok, shop: A });
ok(s1.status === 403, `üye çıkarılınca ANINDA 403 (bayat erişim yok): ${s1.status}`);

console.log('7) Sağlık ve durum');
const h = await call('GET', '/health');
ok(h.data.cache === 'redis' && h.data.redis === 'up', `health: cache=${h.data.cache} redis=${h.data.redis}`);
const st = await call('GET', '/system/cache', { token: owner });
ok(st.status === 200 && st.data.hits > 0 && st.data.hitRatio > 0, `durum: isabet ${st.data.hits}, ıska ${st.data.misses}, oran %${st.data.hitRatio}, ${JSON.stringify(st.data.redis)}`);
const emp = await call('GET', '/system/cache', { token: tok });
ok(emp.status === 401 || emp.status === 403, `yalnız sistem sahibi: ${emp.status}`);
console.log(failures ? `\n${failures} HATA` : '\nTümü geçti');
process.exit(failures ? 1 : 0);
