// İşletmeler arası gizlilik ve özellik yetkileri: uçtan uca (gerçek API + PostgreSQL).
// Çalıştırma: API=http://localhost:3000/api/v1 node test-e2e/tenant-isolation.e2e.mjs
// Ön koşul: çalışan API (NODE_ENV=development) ve tohum hesabı owner@stocktrack.local / Owner123!.
// Ortam: TELEGRAM_BOT_TOKEN, TELEGRAM_OWNER_CHAT_ID ve PORTAL_BASE_URL .env'de tanımlıysa o değerler
// işletmelere sızmadığı da denetlenir (E2E_ENV_CHAT / E2E_ENV_TOKEN ile verin).
const BASE = process.env.API ?? 'http://localhost:3000/api/v1';
const ENV_CHAT = process.env.E2E_ENV_CHAT ?? '';
const ENV_TOKEN = process.env.E2E_ENV_TOKEN ?? '';
let failures = 0;
const ok = (c, m) => {
  if (c) console.log('  ✓', m);
  else {
    failures++;
    console.log('  ✗', m);
  }
};
async function call(method, path, { token, shop, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  let d;
  try {
    d = JSON.parse(t);
  } catch {
    d = t;
  }
  return { status: res.status, data: d?.data ?? d, raw: t };
}
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.accessToken;
const tag = Date.now().toString(36).slice(-5);

const owner = await login('owner@stocktrack.local', 'Owner123!');
ok(!!owner, 'sistem sahibi girişi');

console.log('1) İki işletme kaydı + onay');
const label = (await call('POST', '/platform/labels', { token: owner, body: { name: `Atölye ${tag}`, description: 'x' } })).data;
const label2 = (await call('POST', '/platform/labels', { token: owner, body: { name: `Malzemeci ${tag}`, description: 'y' } })).data;
async function register(name, labelId) {
  const email = `${name.toLowerCase().replace(/\W+/g, '')}${tag}@ornek.test`;
  const r = await call('POST', '/registration', {
    body: {
      businessName: `${name} ${tag}`, ownerName: `${name} Sahibi`, email, phone: '05321112233',
      password: 'Parola-12345', province: 'İstanbul', district: 'Kadıköy', labelIds: [labelId], acceptTerms: true,
    },
  });
  const shopId = r.data?.shop?.id;
  if (shopId) await call('POST', `/platform/businesses/${shopId}/approve`, { token: owner });
  const token = await login(email, 'Parola-12345');
  const me = (await call('GET', '/auth/me', { token })).data;
  return { email, shopId, token, userId: me?.id, me };
}
const A = await register('Atolye A', label.id);
const B = await register('Malzeme B', label2.id);
ok(A.shopId && B.shopId && A.token && B.token, 'iki işletme açıldı ve girdi');

console.log('2) Telegram: işletmeye jeton/yetkili/yedek/.env sohbeti HİÇ gelmez');
const tgA = await call('GET', '/settings/telegram', { token: A.token, shop: A.shopId });
ok(tgA.status === 200, `GET /settings/telegram: ${tgA.status}`);
for (const k of ['tokenSet', 'tokenMasked', 'tokenSource', 'chatIdSource', 'backupChatId', 'effectiveBackupChatId', 'backupCron', 'allowedUserIds', 'chatSharedWith']) {
  ok(!(k in (tgA.data ?? {})), `işletme yanıtında "${k}" alanı yok`);
}
ok(tgA.data.ownerView === false && tgA.data.chatId === '', 'işletme kendi (boş) grubunu görür; .env sohbeti kendi sohbeti gibi gösterilmez');
if (ENV_TOKEN) ok(!tgA.raw.includes(ENV_TOKEN.split(':')[1]) && !tgA.raw.includes(ENV_TOKEN.split(':')[0]), '.env bot jetonunun hiçbir parçası yanıtta yok');
if (ENV_CHAT) ok(!tgA.raw.includes(ENV_CHAT), '.env sistem sahibi sohbeti yanıtta yok');
ok(!(tgA.data.routes ?? []).some((r) => r.topic === 'corel'), 'Corel kapalı işletmede "Corel" bildirim konusu listelenmez');
ok((tgA.data.routes ?? []).every((r) => (r.sharedWith ?? []).length === 0), 'konu listesinde başka işletme adı yok');

const tgOwner = await call('GET', '/settings/telegram', { token: owner, shop: A.shopId });
ok(tgOwner.data.ownerView === true && tgOwner.data.tokenSet === true && /••••/.test(tgOwner.data.tokenMasked ?? ''), 'sistem sahibi tam görünümü (maskeli jeton) görür');
if (ENV_TOKEN) ok(!tgOwner.raw.includes(ENV_TOKEN.split(':')[1]), 'sistem sahibi görünümünde bile jetonun gizli kısmı açık değil');

for (const body of [{ telegramBotToken: '1:abc' }, { telegramBotToken: '' }, { telegramAllowedUserIds: '123456' }, { backupTelegramChatId: '-100123456' }]) {
  const r = await call('PUT', '/settings/telegram', { token: A.token, shop: A.shopId, body });
  ok(r.status === 403, `işletme ${Object.keys(body)[0]} yazamaz: ${r.status}`);
}
const badChat = await call('PUT', '/settings/telegram', { token: A.token, shop: A.shopId, body: { telegramChatId: 'merhaba' } });
ok(badChat.status === 400, `geçersiz biçimli sohbet kimliği reddedilir: ${badChat.status}`);
const anyChat = await call('PUT', '/settings/telegram', { token: A.token, shop: A.shopId, body: { telegramChatId: '-1001234567890' } });
ok(anyChat.status === 400, `bot o sohbette olduğu doğrulanamazsa kayıt yapılmaz: ${anyChat.status} (${String(anyChat.data?.message ?? '').slice(0, 60)})`);

console.log('3) İşletme bilgileri: portal adresi/logo yolu yalnız sistem sahibi');
const bizA = await call('GET', '/settings/business', { token: A.token, shop: A.shopId });
ok(bizA.data.portalBaseUrl === '' && bizA.data.logoPath === '', 'işletmeye portal adresi ve logo yolu boş gelir');
const bizOwner = await call('GET', '/settings/business', { token: owner, shop: A.shopId });
ok(bizOwner.data.portalBaseUrl !== '', `sistem sahibi portal adresini görür: ${bizOwner.data.portalBaseUrl}`);
const putEvil = await call('PUT', '/settings/business', { token: A.token, shop: A.shopId, body: { portalBaseUrl: 'https://evil.example/portal' } });
ok(putEvil.status === 403, `işletme portal adresini değiştiremez: ${putEvil.status}`);
const putLogo = await call('PUT', '/settings/business', { token: A.token, shop: A.shopId, body: { businessLogoPath: '/etc/passwd' } });
ok(putLogo.status === 403, `işletme logo yolunu değiştiremez: ${putLogo.status}`);
const putBad = await call('PUT', '/settings/business', { token: owner, shop: A.shopId, body: { portalBaseUrl: 'javascript:alert(1)' } });
ok(putBad.status === 400, `http(s) olmayan portal adresi reddedilir: ${putBad.status}`);
const putOk = await call('PUT', '/settings/business', { token: A.token, shop: A.shopId, body: { businessName: `Atölye Yeni ${tag}`, portalBaseUrl: '', businessLogoPath: '' } });
ok(putOk.status === 200 && putOk.data.name === `Atölye Yeni ${tag}`, 'işletme adı güncellenir');
ok(!('corelApiKey' in putOk.data) && !putOk.raw.includes('telegram'), 'güncelleme yanıtı ham ayar satırı değil (Corel anahtarı/Telegram alanı yok)');

console.log('4) Corel/runner/klasör: sistem sahibi açmadıkça kapalı');
for (const [m, p] of [['GET', '/settings/corel'], ['POST', '/settings/corel/rotate'], ['DELETE', '/settings/corel'], ['GET', '/settings/folders'], ['GET', '/corel-runners']]) {
  const r = await call(m, p, { token: A.token, shop: A.shopId });
  ok(r.status === 403 && /etkin değil/.test(JSON.stringify(r.data)), `${m} ${p} → ${r.status}`);
}
const cutA = (await call('GET', '/settings/cut-pricing', { token: A.token, shop: A.shopId })).data;
for (const k of ['feedMmS', 'rapidMmS', 'plungeSec', 'passDepthMm', 'minArea']) ok(!(k in cutA), `kesim fiyatında Corel alanı "${k}" yok`);
ok('meterRate' in cutA && 'pieceRate' in cutA && 'areaRate' in cutA && 'hourlyRate' in cutA, 'm, m², süre, adet ücretleri var');
const cutPut = await call('PUT', '/settings/cut-pricing', { token: A.token, shop: A.shopId, body: { meterRate: 40, pieceRate: 25, areaRate: 120, hourlyRate: 600, minMinutes: 15, feedMmS: 99 } });
ok(cutPut.status === 200 && cutPut.data.meterRate === 40 && cutPut.data.pieceRate === 25 && !('feedMmS' in cutPut.data), 'dört birimli fiyat kaydedilir; Corel alanı yazılmaz');
const cutOwner = (await call('GET', '/settings/cut-pricing', { token: owner, shop: A.shopId })).data;
ok(cutOwner.feedMmS === 20, 'Corel alanı işletme tarafından değişmedi (varsayılan 20)');

const mineA = (await call('GET', '/shops/mine', { token: A.token })).data;
ok(mineA[0]?.features && mineA[0].features.corel === false && mineA[0].features.directory === true, `işletme kendi özelliklerini görür: ${JSON.stringify(mineA[0]?.features)}`);

const enable = await call('PATCH', `/platform/businesses/${A.shopId}`, { token: owner, body: { features: { corel: true } } });
ok(enable.status === 200 && enable.data.features.corel === true, 'sistem sahibi A işletmesine Corel açtı');
const rot = await call('POST', '/settings/corel/rotate', { token: A.token, shop: A.shopId });
const key = rot.data?.apiKey;
ok(rot.status === 201 && key, 'Corel açılınca işletme anahtar üretebilir');
const ping = await fetch(BASE + '/corel/ping', { headers: { 'X-Api-Key': key } });
ok(ping.status === 200, `Corel eklentisi anahtarla bağlanır: ${ping.status}`);
const tgA2 = await call('GET', '/settings/telegram', { token: A.token, shop: A.shopId });
ok((tgA2.data.routes ?? []).some((r) => r.topic === 'corel'), 'Corel açılınca "Corel" bildirim konusu görünür');
const bad = await call('PATCH', `/platform/businesses/${A.shopId}`, { token: owner, body: { features: { hack: true } } });
ok(bad.status === 400, `bilinmeyen özellik adı reddedilir: ${bad.status}`);
await call('PATCH', `/platform/businesses/${A.shopId}`, { token: owner, body: { features: { corel: false } } });
const ping2 = await fetch(BASE + '/corel/ping', { headers: { 'X-Api-Key': key } });
ok(ping2.status === 403, `Corel kapatılınca eski anahtar da çalışmaz: ${ping2.status}`);
const own2 = await call('GET', '/settings/corel', { token: A.token, shop: A.shopId });
ok(own2.status === 403, 'kapatılınca ayar ekranı API\'si de kapanır');
const selfEnable = await call('PATCH', `/platform/businesses/${A.shopId}`, { token: A.token, body: { features: { corel: true } } });
ok(selfEnable.status === 403, `işletme özelliği kendisi açamaz: ${selfEnable.status}`);

console.log('5) Ekip: gizli not, e-posta taraması, personel listesi');
await call('PATCH', `/platform/businesses/${A.shopId}`, { token: owner, body: { adminNote: 'GİZLİ-NOT-123' } });
const shopsA = await call('GET', '/shops', { token: A.token });
ok(shopsA.status === 200 && !shopsA.raw.includes('GİZLİ-NOT-123') && !shopsA.raw.includes('adminNote'), 'işletme yöneticisi sistem sahibinin gizli notunu görmez');
const shopsOwner = await call('GET', '/shops', { token: owner });
ok(shopsOwner.raw.includes('GİZLİ-NOT-123'), 'sistem sahibi notu görür');
const add = await call('POST', `/shops/${A.shopId}/members`, { token: A.token, body: { email: B.email, permissions: {} } });
ok(add.status === 404, `başka işletmenin kullanıcısı e-postayla eklenemez: ${add.status}`);
const add2 = await call('POST', `/shops/${A.shopId}/members`, { token: A.token, body: { email: 'yok-boyle-biri@ornek.test', permissions: {} } });
ok(add2.status === 404 && add.data.message === add2.data.message, `olan/olmayan e-posta aynı yanıtı verir (tarama yok): "${add.data.message}"`);
const staffA = await call('GET', '/shops/current/staff', { token: A.token, shop: A.shopId });
ok(!staffA.raw.includes('Sahibi') || staffA.data.every((s) => s.fullName.includes('Atolye')), 'personel listesinde sistem sahibi yok');
const staffOwner = await call('GET', '/shops/current/staff', { token: owner, shop: A.shopId });
ok(staffOwner.data.some((s) => s.fullName === 'İşletme Sahibi'), 'sistem sahibi kendi listesinde var');

console.log('6) Ödeme/satış kayıtlarına gömülü kullanıcı yalnız id+ad');
const cust = (await call('POST', '/customers', { token: A.token, shop: A.shopId, body: { name: 'Test Müşteri' } })).data;
const pay = await call('POST', `/customers/${cust.id}/payments`, { token: A.token, shop: A.shopId, body: { amount: 100, method: 'cash', receivedById: A.userId } });
ok(pay.status === 201, `nakit ödeme alındı: ${pay.status}`);
const payments = await call('GET', `/customers/${cust.id}/payments`, { token: A.token, shop: A.shopId });
const rb = JSON.stringify(payments.data);
ok(!rb.includes(A.email) && !rb.includes('telegramUserId') && !rb.includes('"role"') && !rb.includes('"phone":"0532'), 'ödeme kaydında teslim alanın e-postası/rolü/telefonu/Telegram kimliği yok');
ok(rb.includes(A.me.fullName), 'ödemede teslim alanın adı var');
const foreign = await call('POST', `/customers/${cust.id}/payments`, { token: A.token, shop: A.shopId, body: { amount: 10, method: 'cash', receivedById: B.userId } });
ok(foreign.status === 400, `başka işletmenin çalışanı "teslim alan" yapılamaz: ${foreign.status}`);

console.log('7) Kullanıcı yönetimi (sistem sahibi) tam görünüm, parola özeti yok');
const created = await call('POST', '/users', { token: owner, body: { fullName: 'Test Kullanıcı', email: `kullanici${tag}@ornek.test`, password: 'Parola-12345', role: 'employee' } });
ok(created.status === 201 && created.data.email && !created.raw.includes('passwordHash') && !created.raw.includes('$2b$'), 'kullanıcı oluşturma yanıtında parola özeti yok');
const list = await call('GET', '/users', { token: owner });
ok(list.data.every((u) => 'email' in u && 'role' in u), 'sistem sahibi kullanıcı listesinde e-posta/rol görür');
ok((await call('GET', '/users', { token: A.token })).status === 403, 'işletme kullanıcı listesine erişemez');

console.log('8) Rehber ve ağ: özellik kapısı');
const dirOk = await call('GET', '/directory/shops', { token: A.token, shop: A.shopId });
ok(dirOk.status === 200, `rehber açıkken çalışır: ${dirOk.status}`);
await call('PATCH', `/platform/businesses/${A.shopId}`, { token: owner, body: { features: { directory: false, network: false } } });
const dirOff = await call('GET', '/directory/shops', { token: A.token, shop: A.shopId });
ok(dirOff.status === 403, `rehber kapatılınca 403: ${dirOff.status}`);
const netOff = await call('GET', '/customer-network/lookup?phone=05321234567', { token: A.token, shop: A.shopId });
ok(netOff.status === 403, `müşteri ağı kapatılınca 403: ${netOff.status}`);
await call('PATCH', `/platform/businesses/${A.shopId}`, { token: owner, body: { features: { directory: true, network: true } } });

console.log('9) Platform: iş kolu etiketine göre işletme listesi');
const byLabel = await call('GET', `/platform/businesses?labelId=${label.id}`, { token: owner });
ok(byLabel.data.items.length >= 1 && byLabel.data.items.every((b) => b.labelIds.includes(label.id)), `etikete göre süzgeç: ${byLabel.data.items.length} işletme`);
ok(byLabel.data.items.some((b) => b.id === A.shopId) && !byLabel.data.items.some((b) => b.id === B.shopId), 'diğer etiketteki işletme listede yok');
const byFeature = await call('GET', '/platform/businesses?feature=corel', { token: owner });
ok(byFeature.data.items.every((b) => b.features.corel === true), 'özelliğe göre süzgeç');
ok((await call('GET', '/platform/businesses', { token: A.token })).status === 403, 'işletme platform listesine erişemez');

console.log('10) Portal bağlantısı sistem sahibinin adresiyle');
const pt = await call('POST', `/customers/${cust.id}/portal-token`, { token: A.token, shop: A.shopId });
ok(pt.status === 201 && pt.data.url.startsWith('https://portal.sistem.example/portal/'), `portal bağlantısı: ${String(pt.data.url).slice(0, 50)}…`);

console.log(failures ? `\n${failures} DENEME BAŞARISIZ` : '\nHepsi geçti ✔');
process.exit(failures ? 1 : 0);
