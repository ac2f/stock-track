// Stok kalemi depolama/performans düzenlemesi: kısa ve atomik stok kodu, saklanmayan (türetilen) ad,
// ad yokken de çalışan arama, transferde alıcıya kendi kodu, pazar yerinde türetilmiş ad.
// Çalıştırma: API=http://localhost:3000/api/v1 [E2E_PSQL='psql -h ... -d ...'] node test-e2e/catalog-storage.e2e.mjs
// E2E_PSQL verilirse "ad gerçekten saklanmıyor (NULL)" ve sayaç satırı veritabanından da doğrulanır.
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
const psql = (sql) => (process.env.E2E_PSQL ? execSync(`${process.env.E2E_PSQL} -At -c "${sql.replace(/"/g, '\\"')}"`, { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? 'x' } }).toString().trim() : null);
const tag = Date.now().toString(36).slice(-5);
const owner = await login('owner@stocktrack.local', 'Owner123!');
const label = (await call('POST', '/platform/labels', { token: owner, body: { name: `Depo ${tag}`, description: 'x' } })).data;
async function biz(name) {
  const email = `${name.toLowerCase()}${tag}@ornek.test`;
  const r = await call('POST', '/registration', { body: { businessName: `${name} ${tag}`, ownerName: `${name} Sahibi`, email, phone: '05321112233', password: 'Parola-12345', province: 'İstanbul', district: 'Kadıköy', labelIds: [label.id], acceptTerms: true } });
  const shop = r.data.shop.id;
  await call('POST', `/platform/businesses/${shop}/approve`, { token: owner });
  const token = await login(email, 'Parola-12345');
  return { name: `${name} ${tag}`, shop, token, as: (m, p, body) => call(m, p, { token, shop, body }) };
}
const S = await biz('Satici');
const B = await biz('Alici');
const SKU_RE = /^[A-Z0-9]+-\d{6,}$/;

console.log('1) 30 tabaka tek işlemde: kısa, benzersiz, sıralı stok kodu');
const t0 = Date.now();
const mk = await S.as('POST', '/plates/batch', { items: [{ categoryName: 'Pleksi', templateName: `Pleksi Seffaf ${tag}`, brandName: 'Akpolimer', colorName: 'Şeffaf', measurementType: 'area', widthMm: 1220, heightMm: 2440, quantityInStock: 1, thicknessMm: 3, sheetWidthMm: 1220, sheetHeightMm: 2440, copies: 30 }] });
const ms = Date.now() - t0;
const ids = mk.data?.plateIds ?? [];
ok(ids.length === 30, `30 kalem açıldı (${ms} ms)`);
const list = (await S.as('GET', '/plates?limit=100')).data.items.filter((p) => ids.includes(p.id));
const skus = list.map((p) => p.sku);
ok(skus.every((s) => SKU_RE.test(s)), `hepsi TÜR-000123 biçiminde: ${skus[0]}`);
ok(new Set(skus).size === 30, '30 kod benzersiz');
ok(Math.max(...skus.map((s) => s.length)) <= 20, `kısa (en uzun ${Math.max(...skus.map((s) => s.length))} karakter; eski biçim ~80)`);
const nums = skus.map((s) => Number(s.split('-').pop())).sort((a, b) => a - b);
ok(nums[29] - nums[0] === 29, 'kodlar ardışık (tek sayaç güncellemesi)');
ok(!/AKPOLIMER|SEFFAF|3MM/.test(skus[0]), 'kod marka/renk/kalınlığı yeniden YAZMAZ');

console.log('2) Ad saklanmaz, okurken üretilir (biçim eskisiyle aynı)');
const p = list[0];
ok(p.name === 'Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00', `görünen ad: ${p.name}`);
ok(!('customName' in p), 'ham sütun API çıktısına sızmıyor');
const dbNull = psql(`select count(*) from material_plates where shop_id='${S.shop}' and name is not null`);
if (dbNull !== null) ok(dbNull === '0', `veritabanında saklı ad sayısı: ${dbNull} (otomatik adlar NULL)`);

console.log('3) Eski ön yüz/çevrimdışı kuyruktan gelen türetilmiş ad da saklanmaz; elle yazılan saklanır');
const same = await S.as('POST', '/plates/batch', { items: [{ categoryName: 'Pleksi', templateName: `Pleksi Seffaf ${tag}`, brandName: 'Akpolimer', colorName: 'Şeffaf', measurementType: 'area', widthMm: 1220, heightMm: 2440, quantityInStock: 1, thicknessMm: 3, sheetWidthMm: 1220, sheetHeightMm: 2440, name: 'Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00' }] });
const custom = await S.as('POST', '/plates/batch', { items: [{ categoryName: 'Pleksi', templateName: `Pleksi Seffaf ${tag}`, brandName: 'Akpolimer', colorName: 'Şeffaf', measurementType: 'area', widthMm: 1220, heightMm: 2440, quantityInStock: 1, thicknessMm: 3, sheetWidthMm: 1220, sheetHeightMm: 2440, name: `Vitrin ayrıldı ${tag}` }] });
const sameId = same.data.plateIds[0]; const customId = custom.data.plateIds[0];
if (dbNull !== null) {
  ok(psql(`select name is null from material_plates where id='${sameId}'`) === 't', 'türetilmişle aynı ad → NULL');
  ok(psql(`select name from material_plates where id='${customId}'`) === `Vitrin ayrıldı ${tag}`, 'elle yazılan ad saklandı');
}
ok((await S.as('GET', `/plates/${customId}`)).data.name === `Vitrin ayrıldı ${tag}`, 'elle yazılan ad görünür');

console.log('4) Düzenleme: aynı adı geri yollamak donmaz; yeni ad saklanır; boşaltınca yeniden türetilir');
let u = await S.as('PATCH', `/plates/${sameId}`, { name: 'Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00', variant: 'Dökme' });
ok(u.status === 200, `düzenleme: ${u.status}`);
if (dbNull !== null) ok(psql(`select name is null from material_plates where id='${sameId}'`) === 't', 'görünen ad geri yollanınca saklanmadı');
u = await S.as('PATCH', `/plates/${sameId}`, { name: `Rafta ${tag}` });
ok((await S.as('GET', `/plates/${sameId}`)).data.name === `Rafta ${tag}`, 'yeni elle ad görünür');
u = await S.as('PATCH', `/plates/${sameId}`, { name: 'Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00' });
ok((await S.as('GET', `/plates/${sameId}`)).data.name === 'Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00', 'türetilmiş adı geri yazınca yeniden türetilir');
if (dbNull !== null) ok(psql(`select name is null from material_plates where id='${sameId}'`) === 't', '… ve yine saklanmaz (NULL)');
ok((await S.as('PATCH', `/plates/${sameId}`, { name: '' })).status === 400, 'boş ad eskiden olduğu gibi reddedilir (400)');

console.log('5) Ad satırda olmadığı hâlde arama aynı şeyleri buluyor');
const skuOf0 = (await S.as('GET', `/plates/${ids[0]}`)).data.sku;
const find = async (q) => (await S.as('GET', `/plates?limit=100&search=${encodeURIComponent(q)}`)).data.items.some((x) => x.id === ids[0]);
ok(await find('akpolimer'), 'marka');
ok(await find('seffaf'), 'renk (Türkçe harfsiz)');
ok(await find('pleksi'), 'tür');
ok(await find('3'), 'kalınlık sayısı');
ok(await find('1220'), 'standart ebat (en)');
ok(await find('2440'), 'standart ebat (boy)');
ok(await find(skuOf0), `stok kodu (${skuOf0})`);
ok(!(await find('olmayanbirsey')), 'olmayan sözcük bulunmaz');

console.log('6) Liste sırası kararlı (tür → marka → renk → kalınlık → ad → kimlik)');
const a = (await S.as('GET', '/plates?limit=10&page=1')).data.items.map((x) => x.id);
const a2 = (await S.as('GET', '/plates?limit=10&page=1')).data.items.map((x) => x.id);
ok(JSON.stringify(a) === JSON.stringify(a2), 'aynı sayfa iki kez aynı sırada');

console.log('7) Transfer: alıcı kendi stok kodunu alır (satıcınınki kopyalanmaz); ad alıcıda türetilir');
// satıcının en yüksek numaralı kodlu kalemi: alıcıdaki 000001 ile karışmasın
const pid = list.reduce((m, x) => (Number(x.sku.split('-').pop()) > Number(m.sku.split('-').pop()) ? x : m)).id;
const prop = await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: pid, quantity: 1, unitPrice: 100 }] });
ok(prop.status === 201, `teklif: ${prop.status}`);
const appr = await B.as('POST', `/shop-transfers/${prop.data.id}/approve`, {});
ok(appr.status === 201 && appr.data.status === 'completed', `onay: ${appr.status} ${appr.data?.status}`);
const bPlates = (await B.as('GET', '/plates?limit=50')).data.items;
ok(bPlates.length === 1, 'alıcıda 1 kalem');
const bp = bPlates[0];
ok(SKU_RE.test(bp.sku) && bp.sku.endsWith('-000001'), `alıcının kendi sayacından: ${bp.sku}`);
const sellerSku = list.find((x) => x.id === pid).sku;
ok(bp.sku !== sellerSku, `satıcının kodu (${sellerSku}) alıcıya kopyalanmadı`);
ok(bp.name === 'Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00', `alıcıda görünen ad: ${bp.name}`);
const cnt = psql(`select key||'='||value from shop_counters where shop_id='${B.shop}'`);
if (cnt !== null) ok(cnt === 'plate_sku=1', `alıcı sayacı: ${cnt}`);

console.log('8) İki işletmenin sayacı birbirinden bağımsız');
const bMore = await B.as('POST', '/plates/batch', { items: [{ categoryName: 'MDF', templateName: `MDF ${tag}`, measurementType: 'area', widthMm: 2100, heightMm: 2800, quantityInStock: 1, thicknessMm: 18, sheetWidthMm: 2100, sheetHeightMm: 2800 }] });
const bm = (await B.as('GET', `/plates/${bMore.data.plateIds[0]}`)).data;
ok(/^[A-Z0-9]+-000002$/.test(bm.sku), `alıcının ikinci kodu 000002: ${bm.sku}`);
ok(skus.every((s) => s !== bm.sku), 'iki işletmenin kodları ayrı sıralarda');

console.log('9) Pazar yerinde türetilmiş ad görünür; maliyet/alış sızmaz');
const cat = (await S.as('GET', `/plates/${ids[1]}`)).data.template.category.id;
await S.as('PUT', '/stock-shares', { kind: 'category', refId: cat, visibility: 'public' });
const lst = await B.as('GET', `/marketplace/listings?search=${tag}&limit=100`);
const item = lst.data.items.find((i) => i.plateId === ids[1]);
ok(item && item.name === 'Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00', `pazar yeri adı: ${item?.name}`);
ok(!/cost|purchase|supplier|customer/i.test(JSON.stringify(item)), 'pazar yeri satırında maliyet/müşteri yok');
await S.as('POST', '/stock-shares/set-all', { isActive: false });

console.log(failures ? `\n${failures} adım BAŞARISIZ` : '\nHepsi geçti ✔');
process.exit(failures ? 1 : 0);
