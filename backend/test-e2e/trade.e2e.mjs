// İşletmeler arası ticaret: onay/ret, ortak yetkileri (otomatik onay, görüntüleme, engel; süreli),
// stok paylaşımı ("bende var") + alım talebi, ürün türü önerisi — ve hepsinde yetkisiz/başka işletme denemeleri.
// Çalıştırma: API=http://localhost:3000/api/v1 [E2E_PSQL='psql -h ... -d ...'] node test-e2e/trade.e2e.mjs
// E2E_PSQL (isteğe bağlı): yetki süresinin DOLMASINI sınamak için bitiş zamanını geriye çeker.
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
const tag = Date.now().toString(36).slice(-5);
const owner = await login('owner@stocktrack.local', 'Owner123!');
const label = (await call('POST', '/platform/labels', { token: owner, body: { name: `Ticaret ${tag}`, description: 'x' } })).data;

async function biz(name, { hidden = false } = {}) {
  const email = `${name.toLowerCase()}${tag}@ornek.test`;
  const r = await call('POST', '/registration', { body: { businessName: `${name} ${tag}`, ownerName: `${name} Sahibi`, email, phone: '05321112233', password: 'Parola-12345', province: 'İstanbul', district: 'Kadıköy', labelIds: [label.id], acceptTerms: true } });
  const shop = r.data.shop.id;
  await call('POST', `/platform/businesses/${shop}/approve`, { token: owner });
  const token = await login(email, 'Parola-12345');
  if (hidden) await call('PATCH', '/business-profile', { token, shop, body: { directoryVisible: false } });
  const me = (await call('GET', '/auth/me', { token })).data;
  return { name: `${name} ${tag}`, email, shop, token, userId: me.id, as: (m, p, body) => call(m, p, { token, shop, body }) };
}
const noPerm = Object.fromEntries(['stock', 'catalog', 'purchases', 'processing', 'quotes', 'sales', 'customers', 'payments', 'expenses', 'banking', 'reports', 'settings'].map((m) => [m, { read: false, write: false }]));
const readOnly = Object.fromEntries(Object.keys(noPerm).map((m) => [m, { read: true, write: false }]));
async function staff(b, kind, permissions) {
  const email = `${kind}${b.name.replace(/\W/g, '').toLowerCase()}@ornek.test`;
  await call('POST', `/shops/${b.shop}/members`, { token: b.token, body: { newUser: { fullName: kind, email, password: 'Parola-12345' }, permissions } });
  const token = await login(email, 'Parola-12345');
  return { as: (m, p, body) => call(m, p, { token, shop: b.shop, body }) };
}
const total = (r) => Number(r.data?.totalAmount);
// Tamamı satılan kalem silinir (404) → 0 sayılır.
const plateQty = async (b, id) => { const r = await b.as('GET', `/plates/${id}`); return r.status === 200 ? Number(r.data.quantityInStock) : 0; };

const S = await biz('Satici');
const B = await biz('Alici');
const C = await biz('Ucuncu', { hidden: true });
const Bnone = await staff(B, 'izinsiz', noPerm);
const Bread = await staff(B, 'okur', readOnly);
const Snone = await staff(S, 'izinsiz', noPerm);

console.log('1) Satıcı stok açar; keşif (rehberde görünmeyen işletme bulunamaz)');
const mk = await S.as('POST', '/plates/batch', { items: [{ categoryName: 'Pleksi', templateName: `Pleksi Seffaf ${tag}`, brandName: 'Akpolimer', colorName: 'Şeffaf', name: `S Levha ${tag}`, measurementType: 'area', widthMm: 1000, heightMm: 1000, quantityInStock: 1, thicknessMm: 3, sheetWidthMm: 1000, sheetHeightMm: 1000, copies: 3 }] });
const plateIds = mk.data?.plateIds ?? [];
ok(plateIds.length >= 3, `satıcıda ${plateIds.length} levha`);
const [p1, p2, p3] = plateIds;
const find = (await S.as('GET', `/shop-transfers/targets?q=${encodeURIComponent('Alici ' + tag)}`)).data;
ok(find.some((t) => t.id === B.shop), 'rehberdeki alıcı bulunur');
const hid = (await S.as('GET', `/shop-transfers/targets?q=${encodeURIComponent('Ucuncu ' + tag)}`)).data;
ok(!hid.some((t) => t.id === C.shop), 'rehberde görünmeyen işletme aramada çıkmaz');
ok(!find.some((t) => t.id === S.shop), 'kendisi listede yok');

console.log('2) Satış teklifi → ONAY BEKLER, hiçbir kayıt yazılmaz');
const s0 = await plateQty(S, p1);
const prop = await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p1, quantity: 1, unitPrice: 100 }], note: 'deneme' });
ok(prop.status === 201 && prop.data.status === 'pending', `teklif oluştu, durum: ${prop.data?.status}`);
const tid = prop.data.id;
ok(prop.data.initiatedByMe && prop.data.canWithdraw && !prop.data.canDecide, 'satıcı: geri çekebilir, onaylayamaz');
ok((await plateQty(S, p1)) === s0, 'satıcı stoğu DEĞİŞMEDİ');
const bList = (await B.as('GET', '/plates?limit=100')).data;
ok(!JSON.stringify(bList).includes(`S Levha ${tag}`), 'alıcı stoğunda henüz kayıt YOK');
const inc = await B.as('GET', '/shop-transfers?status=open');
ok(inc.data.items.some((t) => t.id === tid && t.canDecide === true), 'alıcı bekleyen teklifi görür ve karar verebilir');
const cnt = await B.as('GET', '/shop-transfers/pending-count');
ok(cnt.data.awaitingMe >= 1, `alıcı rozeti: ${JSON.stringify(cnt.data)}`);

console.log('3) Yetkisiz denemeler (onay/ret)');
for (const [who, actor] of [['alıcının izinsiz çalışanı', Bnone], ['alıcının salt-okur çalışanı', Bread]]) {
  const r = await actor.as('POST', `/shop-transfers/${tid}/approve`, {});
  ok(r.status === 403, `${who} onaylayamaz: ${r.status}`);
  const j = await actor.as('POST', `/shop-transfers/${tid}/reject`, {});
  ok(j.status === 403, `${who} reddedemez: ${j.status}`);
}
ok((await S.as('POST', `/shop-transfers/${tid}/approve`, {})).status === 403, 'teklifi başlatan kendi teklifini onaylayamaz');
ok((await S.as('POST', `/shop-transfers/${tid}/reject`, {})).status === 403, 'teklifi başlatan reddedemez (geri çeker)');
ok((await C.as('POST', `/shop-transfers/${tid}/approve`, {})).status === 404, 'üçüncü işletme onaylayamaz (404)');
ok((await C.as('GET', `/shop-transfers/${tid}`)).status === 404, 'üçüncü işletme belgeyi göremez');
ok(!JSON.stringify((await C.as('GET', '/shop-transfers')).data).includes(tid), 'üçüncü işletme listesinde yok');
ok((await Snone.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p2, quantity: 1, unitPrice: 1 }] })).status === 403, 'satıcının izinsiz çalışanı teklif açamaz');
ok((await B.as('POST', '/shop-transfers', { toShopId: S.shop, items: [{ plateId: p2, quantity: 1, unitPrice: 1 }] })).status === 404, 'alıcı, satıcının plakasını kendi adına satamaz (kendi stoğunda yok)');
ok((await Bnone.as('GET', `/marketplace/listings?search=${tag}`)).status === 403, 'izinsiz çalışan pazar yerini göremez');

console.log('4) Alıcı onaylar → iki taraf tek işlemde yazılır; izleme bağımsız işletmeye sızmaz');
const ap = await B.as('POST', `/shop-transfers/${tid}/approve`, { note: 'tamam' });
ok(ap.status === 201 && ap.data.status === 'completed', `onay: ${ap.status} ${ap.data?.status}`);
ok((await plateQty(S, p1)) < s0, 'satıcı stoğu düştü');
ok(JSON.stringify((await B.as('GET', '/plates?limit=100')).data).includes(`S Levha ${tag}`), 'alıcı stoğuna girdi');
ok((await B.as('POST', `/shop-transfers/${tid}/approve`, {})).status === 400, 'ikinci onay reddedilir (çift kayıt yok)');
const sView = (await S.as('GET', `/shop-transfers/${tid}`)).data;
ok(sView.trackingVisible === false && sView.items.every((i) => i.state === 'untracked' && i.usages.length === 0), 'satıcı alıcının stoğunu/satışlarını İZLEYEMEZ');
const bView = (await B.as('GET', `/shop-transfers/${tid}`)).data;
ok(bView.trackingVisible === true, 'alıcı kendi kalemlerini izler');
ok(!JSON.stringify(sView).includes(B.userId) && !/telegram|email|phone/i.test(JSON.stringify(sView.fromShop) + JSON.stringify(sView.toShop)), 'belgede karşı tarafın kişisel verisi yok');

console.log('5) Ret ve geri çekme');
const prop2 = await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p2, quantity: 1, unitPrice: 50 }] });
const rj = await B.as('POST', `/shop-transfers/${prop2.data.id}/reject`, { note: 'fiyat yüksek' });
ok(rj.status === 201 && rj.data.status === 'rejected' && rj.data.decisionNote === 'fiyat yüksek', 'alıcı reddetti (nedenle)');
ok((await B.as('POST', `/shop-transfers/${prop2.data.id}/approve`, {})).status === 400, 'reddedilen onaylanamaz');
ok((await plateQty(S, p2)) > 0, 'ret stoğa dokunmadı');
const prop3 = await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p2, quantity: 1, unitPrice: 50 }] });
ok((await B.as('POST', `/shop-transfers/${prop3.data.id}/cancel`, {})).status === 403, 'alıcı satıcının teklifini geri çekemez');
const wd = await S.as('POST', `/shop-transfers/${prop3.data.id}/cancel`, {});
ok(wd.data.status === 'cancelled', 'satıcı teklifini geri çekti');
ok((await B.as('POST', `/shop-transfers/${prop3.data.id}/approve`, {})).status === 400, 'geri çekilen onaylanamaz');

console.log('6) Tamamlanmış belgeyi geri alma = karşı tarafın onayıyla');
const rq = await S.as('POST', `/shop-transfers/${tid}/cancel`, { note: 'yanlış gönderildi' });
ok(rq.data.status === 'completed' && rq.data.cancelRequest?.byMe === true, 'satıcı geri alma TALEBİ açtı (belge hâlâ tamamlandı)');
ok((await S.as('POST', `/shop-transfers/${tid}/approve`, {})).status === 403, 'talep sahibi kendi talebini onaylayamaz');
ok((await Bnone.as('POST', `/shop-transfers/${tid}/approve`, {})).status === 403, 'izinsiz çalışan geri almayı onaylayamaz');
const rj2 = await B.as('POST', `/shop-transfers/${tid}/reject`, {});
ok(rj2.data.cancelRequest === null && rj2.data.status === 'completed', 'alıcı geri almayı reddetti, belge duruyor');
await S.as('POST', `/shop-transfers/${tid}/cancel`, {});
const stockBefore = await plateQty(S, p1);
const ap2 = await B.as('POST', `/shop-transfers/${tid}/approve`, {});
ok(ap2.data.status === 'cancelled', `alıcı onayladı → geri alındı: ${ap2.data?.status}`);
ok((await plateQty(S, p1)) > stockBefore, 'satıcı stoğu iade edildi');
ok(!JSON.stringify((await B.as('GET', '/plates?limit=100')).data).includes(`S Levha ${tag}`), 'alıcıdaki parça silindi');

console.log('7) Ortak yetkileri: otomatik onay (süreli), görüntüleme, engel');
ok((await Bread.as('PUT', '/partners/grants', { granteeShopId: S.shop, permission: 'auto_approve' })).status === 403, 'salt-okur çalışan yetki veremez');
const Badm = B; // yönetici
ok((await Snone.as('GET', '/partners/grants')).status === 403, 'izinsiz çalışan yetkileri göremez');
const past = await Badm.as('PUT', '/partners/grants', { granteeShopId: S.shop, permission: 'auto_approve', expiresAt: new Date(Date.now() - 1000).toISOString() });
ok(past.status === 400, 'geçmiş bitiş reddedilir');
ok((await Badm.as('PUT', '/partners/grants', { granteeShopId: S.shop, permission: 'auto_approve', expiresAt: new Date(Date.now() + 8 * 365 * 86400000).toISOString() })).status === 400, 'en çok 5 yıl');
ok((await Badm.as('PUT', '/partners/grants', { granteeShopId: B.shop, permission: 'auto_approve' })).status === 400, 'kendine yetki veremez');
const grant = await Badm.as('PUT', '/partners/grants', { granteeShopId: S.shop, permission: 'auto_approve', expiresAt: new Date(Date.now() + 3600_000).toISOString(), note: 'süreli' });
ok(grant.status === 200 && grant.data.expiresAt, 'B, S\'ye 1 saatlik otomatik onay verdi');
const sGrants = (await S.as('GET', '/partners/grants')).data;
ok(sGrants.received.some((g) => g.permission === 'auto_approve' && g.shop.id === B.shop) && sGrants.given.length === 0, 'S, kendisine tanınanı (salt okunur) görür');
ok((await S.as('DELETE', `/partners/grants/${grant.data.id}`)).status === 404, 'alan taraf yetkiyi silemez');
const auto = await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p3, quantity: 1, unitPrice: 10 }] });
ok(auto.data.status === 'completed' && auto.data.autoApproved === true, 'yetki varken teklif ONAYSIZ tamamlandı (autoApproved)');
const wrongWay = await B.as('GET', '/partners/grants');
ok(!wrongWay.data.given.some((g) => g.shop.id === C.shop), 'yetki yalnız belirtilen işletme için');
// Süre dolması: bitiş geçmişe çekilir
if (process.env.E2E_PSQL) {
  execSync(`${process.env.E2E_PSQL} -c "update shop_partner_grants set expires_at = now() - interval '1 minute' where id = '${grant.data.id}'"`, { stdio: 'ignore' });
  const mk2 = await S.as('POST', '/plates/batch', { items: [{ categoryName: 'Pleksi', templateName: `Pleksi Seffaf ${tag}`, brandName: 'Akpolimer', colorName: 'Şeffaf', name: `S Levha ${tag} 2`, measurementType: 'area', widthMm: 1000, heightMm: 1000, quantityInStock: 1, thicknessMm: 3, sheetWidthMm: 1000, sheetHeightMm: 1000 }] });
  const afterExpiry = await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: mk2.data.plateIds[0], quantity: 1, unitPrice: 10 }] });
  ok(afterExpiry.data.status === 'pending', 'süre dolunca otomatik onay GEÇERSİZ: teklif yine onay bekler');
  ok(!(await B.as('GET', '/partners/grants')).data.given.some((g) => g.id === grant.data.id), 'süresi dolan yetki listede görünmez');
}
// Engel
const blk = await Badm.as('PUT', '/partners/grants', { granteeShopId: S.shop, permission: 'block' });
ok(blk.status === 200, 'B, S\'yi engelledi');
ok((await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p2, quantity: 1, unitPrice: 5 }] })).status === 404, 'engellenen işletme teklif açamaz (404: engel belli edilmez)');
ok(!(await S.as('GET', `/shop-transfers/targets?q=${encodeURIComponent('Alici ' + tag)}`)).data.some((t) => t.id === B.shop), 'engellenen, engelleyeni aramada bulamaz');
ok(!JSON.stringify((await S.as('GET', '/partners/grants')).data).includes('block'), 'engel karşı tarafın listesinde görünmez');
ok((await Badm.as('PUT', '/partners/grants', { granteeShopId: S.shop, permission: 'view_stock' })).status === 409, 'engelliyken başka yetki verilemez');
await Badm.as('DELETE', `/partners/grants/${blk.data.id}`);
ok((await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p2, quantity: 1, unitPrice: 5 }] })).status === 201, 'engel kalkınca teklif açılır');

console.log('8) Stok paylaşımı ("bende var, satıyorum") ve pazar yeri');
const q = (r) => JSON.stringify(r.data?.items ?? []);
ok(!q(await B.as('GET', `/marketplace/listings?search=${tag}`)).includes(`S Levha ${tag}`), 'paylaşım kuralı yokken hiçbir şey listelenmez');
const plateRuleBad = await B.as('PUT', '/stock-shares', { kind: 'plate', refId: p2, visibility: 'public' });
ok(plateRuleBad.status === 400, 'başkasının kalemi için paylaşım kuralı açılamaz');
ok((await Snone.as('PUT', '/stock-shares', { kind: 'plate', refId: p2 })).status === 403, 'izinsiz çalışan paylaşım açamaz');
const tmpl = (await S.as('GET', '/material-templates')).data.find((t) => t.name.includes(tag));
const rule = await S.as('PUT', '/stock-shares', { kind: 'template', refId: tmpl.id, visibility: 'partners' });
ok(rule.status === 200 && rule.data.itemCount >= 1, `ürün türü grubu paylaşıma açıldı (${rule.data.itemCount} kalem)`);
ok(!q(await B.as('GET', `/marketplace/listings?search=${tag}`)).includes(`S Levha ${tag}`), '"yalnız ortaklar" + görüntüleme yetkisi yok → alıcı göremez');
const vg = await S.as('PUT', '/partners/grants', { granteeShopId: B.shop, permission: 'view_stock', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
ok(vg.status === 200, 'S, B\'ye stok görüntüleme yetkisi verdi (1 saat)');
const lst = await B.as('GET', `/marketplace/listings?search=${tag}`);
ok(q(lst).includes(`S Levha ${tag}`), 'görüntüleme yetkisiyle alıcı listeyi görür');
ok(!q(await C.as('GET', `/marketplace/listings?search=${tag}`)).includes(`S Levha ${tag}`), 'yetkisiz üçüncü işletme göremez');
const item = lst.data.items.find((i) => i.name.startsWith(`S Levha ${tag}`));
ok(item && !/cost|purchase|unitPrice|supplier|customer|buyer/i.test(JSON.stringify(item)), `liste satırında maliyet/alış/müşteri alanı yok: ${Object.keys(item ?? {}).join(',')}`);
ok(!(await S.as('GET', `/marketplace/listings?search=${tag}`)).data.items.some((i) => i.shop.id === S.shop), 'satıcı kendi stoğunu pazar yerinde görmez');
await S.as('PATCH', `/stock-shares/${rule.data.id}`, { visibility: 'public' });
ok(q(await C.as('GET', `/marketplace/listings?search=${tag}`)).includes(`S Levha ${tag}`), 'herkese açık yapılınca üçüncü işletme de görür');
const unlisted = await B.as('POST', '/shop-transfers/request', { fromShopId: S.shop, items: [{ plateId: '00000000-0000-4000-8000-0000000000aa', quantity: 1, unitPrice: 1 }] });
ok(unlisted.status === 404 || unlisted.status === 400, `listede olmayan kalem için talep açılamaz: ${unlisted.status}`);
const Shidden = await S.as('POST', '/plates/batch', { items: [{ categoryName: 'Alüminyum', templateName: `Gizli ${tag}`, name: 'GIZLI LEVHA', measurementType: 'area', widthMm: 500, heightMm: 500, quantityInStock: 1, sheetWidthMm: 500, sheetHeightMm: 500 }] });
const hiddenId = Shidden.data.plateIds[0];
ok((await B.as('POST', '/shop-transfers/request', { fromShopId: S.shop, items: [{ plateId: hiddenId, quantity: 1, unitPrice: 1 }] })).status === 400, 'paylaşılmayan (gizli) kalem için talep reddedilir');
const listedId = lst.data.items.find((i) => i.name.startsWith(`S Levha ${tag}`)).plateId;
const req = await B.as('POST', '/shop-transfers/request', { fromShopId: S.shop, items: [{ plateId: listedId, quantity: 1, unitPrice: 80 }], note: 'alırım' });
ok(req.status === 201 && req.data.status === 'pending' && req.data.initiatedByMe && req.data.direction === 'in', 'alıcı, listeden alım talebi açtı (satıcı onayını bekler)');
ok(JSON.stringify((await S.as('GET', '/shop-transfers?status=open')).data).includes(req.data.id), 'satıcı talebi bekleyenlerde görür');
ok((await B.as('POST', `/shop-transfers/${req.data.id}/approve`, {})).status === 403, 'talebi açan alıcı kendi talebini onaylayamaz');
ok((await Snone.as('POST', `/shop-transfers/${req.data.id}/approve`, {})).status === 403, 'satıcının izinsiz çalışanı onaylayamaz');
const reqOk = await S.as('POST', `/shop-transfers/${req.data.id}/approve`, {});
ok(reqOk.data.status === 'completed' && !reqOk.data.autoApproved, `satıcı talebi onayladı: ${reqOk.data?.status}`);
await S.as('PATCH', `/stock-shares/${rule.data.id}`, { isActive: false });
ok(!q(await C.as('GET', `/marketplace/listings?search=${tag}`)).includes(`S Levha ${tag}`), 'kural kapatılınca liste anında kalkar');
const sets = await S.as('POST', '/stock-shares/set-all', { isActive: true });
ok(sets.status === 201 || sets.status === 200, 'tek tuşla tümünü aç');
await S.as('POST', '/stock-shares/set-all', { isActive: false });

console.log('9) Özellik kapısı: sistem sahibi "ticaret"i kapatırsa');
await call('PATCH', `/platform/businesses/${B.shop}`, { token: owner, body: { features: { trade: false } } });
ok((await B.as('GET', '/shop-transfers')).status === 403, 'kapalı işletme ticaret uçlarına giremez');
ok((await B.as('GET', `/marketplace/listings?search=${tag}`)).status === 403, '… pazar yerine de');
ok((await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: p2, quantity: 1, unitPrice: 5 }] })).status === 404, '… ve başkaları ona teklif gönderemez');
ok(!(await S.as('GET', `/shop-transfers/targets?q=${encodeURIComponent('Alici ' + tag)}`)).data.some((t) => t.id === B.shop), '… aramada da çıkmaz');
await call('PATCH', `/platform/businesses/${B.shop}`, { token: owner, body: { features: { trade: true } } });

console.log('10) Ürün türü önerisi (başka işletmelerin türlerinden seçme)');
// B, işlemlerle bu türü zaten kendi kataloğuna aldı → ona önerilmez; hiç işlem yapmamış C'ye önerilir.
const sugB = await B.as('GET', `/material-templates/community?q=${encodeURIComponent('seffaf ' + tag)}`);
ok(sugB.status === 200 && !sugB.data.some((s) => s.templateName.includes(tag)), 'kendi kataloğunda zaten olan tür B\'ye önerilmez');
const sug = await C.as('GET', `/material-templates/community?q=${encodeURIComponent('seffaf ' + tag)}`);
ok(sug.status === 200 && sug.data.some((s) => s.templateName.includes(tag) && s.categoryName === 'Pleksi'), 'C, S\'nin tanımladığı benzer ürün türünü önerilerde görür');
const sj = JSON.stringify(sug.data);
ok(!sj.includes(S.shop) && !sj.includes(S.name) && !sj.includes(`S Levha ${tag}`), 'öneride işletme kimliği/adı/stok verisi yok');
ok(sug.data[0] && typeof sug.data[0].shops === 'number', `yalnız kullanan işletme SAYISI: ${sug.data[0]?.shops}`);
ok((await C.as('GET', '/material-templates/community')).data.length === 0, 'arama yokken ortak katalog dökülmez');
ok((await Bnone.as('GET', `/material-templates/community?q=pleksi`)).status === 403, 'katalog yazma izni olmayan kullanamaz');
ok((await Bread.as('GET', `/material-templates/community?q=pleksi`)).status === 403, 'salt-okur kullanamaz');
const s0sug = sug.data.find((s) => s.templateName.includes(tag));
const ens = await C.as('POST', '/plates/ensure-template', { categoryName: s0sug.categoryName, brandName: s0sug.brandName, colorName: s0sug.colorName, colorCode: s0sug.colorCode ?? undefined, thicknessMm: s0sug.thicknessMm ?? undefined, sheetWidthMm: s0sug.sheetWidthMm ?? undefined, sheetHeightMm: s0sug.sheetHeightMm ?? undefined, templateName: s0sug.templateName, measurementType: s0sug.measurementType });
ok(ens.status === 201 || ens.status === 200, `öneriden kendi kataloğunda tür açıldı: ${ens.status}`);
const again = await C.as('GET', `/material-templates/community?q=${encodeURIComponent('seffaf ' + tag)}`);
ok(!again.data.some((s) => s.templateName.includes(tag)), 'kendi kataloğunda olan tür artık önerilmez');
await call('PATCH', `/platform/businesses/${S.shop}`, { token: owner, body: { status: 'suspended' } });
const Cagain = await C.as('GET', `/material-templates/community?q=${encodeURIComponent('seffaf ' + tag)}`);
ok(Cagain.status === 200, 'askıdaki işletmeyle ilgili arama hata vermez');
await call('PATCH', `/platform/businesses/${S.shop}`, { token: owner, body: { status: 'active' } });

console.log('11) Eşzamanlılık: çift onay ve aynı kalemin iki işletmeye teklifi');
const rc = await S.as('POST', '/plates/batch', { items: [{ categoryName: 'Pleksi', templateName: `Yaris ${tag}`, name: 'YARIS LEVHA', measurementType: 'area', widthMm: 700, heightMm: 700, quantityInStock: 1, sheetWidthMm: 700, sheetHeightMm: 700 }] });
const race = rc.data.plateIds[0];
await call('PATCH', `/platform/businesses/${C.shop}`, { token: owner, body: { features: { trade: true } } });
await C.as('PATCH', '/business-profile', { directoryVisible: true });
const tB = await S.as('POST', '/shop-transfers', { toShopId: B.shop, items: [{ plateId: race, quantity: 1, unitPrice: 10 }] });
const tC = await S.as('POST', '/shop-transfers', { toShopId: C.shop, items: [{ plateId: race, quantity: 1, unitPrice: 10 }] });
ok(tB.data.status === 'pending' && tC.data.status === 'pending', 'aynı kalem iki işletmeye teklif edildi (ikisi de bekliyor, stok ayrılmadı)');
const dbl = await Promise.all([B.as('POST', `/shop-transfers/${tB.data.id}/approve`, {}), B.as('POST', `/shop-transfers/${tB.data.id}/approve`, {})]);
ok(dbl.filter((r) => r.status === 201).length === 1, `aynı belge eşzamanlı iki kez onaylandı → yalnız biri başarılı: ${dbl.map((r) => r.status)}`);
const lateC = await C.as('POST', `/shop-transfers/${tC.data.id}/approve`, {});
ok(lateC.status >= 400 && lateC.status < 500, `kalem zaten satıldı → ikinci işletmenin onayı reddedilir: ${lateC.status}`);
ok((await C.as('GET', `/shop-transfers/${tC.data.id}`)).data.status === 'pending', 'başarısız onay belgeyi bozmadı (hâlâ bekliyor)');
const seen = JSON.stringify((await C.as('GET', '/plates?limit=100')).data);
ok(!seen.includes('YARIS LEVHA'), 'ikinci işletmeye hayalet stok girmedi');

console.log(failures ? `\n${failures} DENEME BAŞARISIZ` : '\nHepsi geçti ✔');
process.exit(failures ? 1 : 0);
