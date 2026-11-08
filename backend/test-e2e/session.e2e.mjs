// Oturum güvenliği: parola değişince eski oturumlar (access + refresh) düşer; pasif hesap girişi reddedilir;
// var olan/olmayan hesapta aynı hata (hesap sızdırmaz).
// Çalıştırma: API=http://localhost:3000/api/v1 node test-e2e/session.e2e.mjs
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
const login = (email, password) => call('POST', '/auth/login', { body: { email, password } });
const tag = Date.now().toString(36).slice(-5);
const owner = (await login('owner@stocktrack.local', 'Owner123!')).data.accessToken;

// Bir işletme
const label = (await call('POST', '/platform/labels', { token: owner, body: { name: `Oturum ${tag}`, description: 'x' } })).data;
const email = `oturum${tag}@ornek.test`;
const reg = await call('POST', '/registration', { body: { businessName: `Oturum ${tag}`, ownerName: 'Oturum Sahibi', email, phone: '05321112233', password: 'Parola-12345', province: 'İstanbul', district: 'Kadıköy', labelIds: [label.id], acceptTerms: true } });
const shop = reg.data.shop.id;
await call('POST', `/platform/businesses/${shop}/approve`, { token: owner });
const first = await login(email, 'Parola-12345');
ok(first.status === 200 && first.data.accessToken && first.data.refreshToken, 'giriş başarılı');
const { accessToken, refreshToken } = first.data;
const me = await call('GET', '/auth/me', { token: accessToken });
ok(me.status === 200, `access token geçerli: ${me.status}`);
const userId = me.data.id;
const rf = await call('POST', '/auth/refresh', { body: { refreshToken } });
ok(rf.status === 200, `refresh çalışıyor: ${rf.status}`);

console.log('1) Sistem sahibi parolayı değiştirir → eski oturumlar düşer');
await new Promise((r) => setTimeout(r, 1100)); // iat saniye hassasiyetli: değişiklik sonraki saniyeye düşsün
const chg = await call('PATCH', `/users/${userId}`, { token: owner, body: { password: 'Yeni-Parola-9876' } });
ok(chg.status === 200, `parola değişti: ${chg.status}`);
const old = await call('GET', '/auth/me', { token: accessToken });
ok(old.status === 401, `eski access token reddedilir: ${old.status}`);
const oldRef = await call('POST', '/auth/refresh', { body: { refreshToken } });
ok(oldRef.status === 401, `eski refresh token reddedilir: ${oldRef.status}`);
const oldPass = await login(email, 'Parola-12345');
ok(oldPass.status === 401, `eski parolayla giriş reddedilir: ${oldPass.status}`);
const fresh = await login(email, 'Yeni-Parola-9876');
ok(fresh.status === 200, `yeni parolayla giriş: ${fresh.status}`);
const meNew = await call('GET', '/auth/me', { token: fresh.data.accessToken });
ok(meNew.status === 200, 'yeni oturum hemen geçerli (aynı saniyede verilen token elenmez)');
const refNew = await call('POST', '/auth/refresh', { body: { refreshToken: fresh.data.refreshToken } });
ok(refNew.status === 200, 'yeni refresh token çalışır');

console.log('2) Hesap sızdırmama: var olan ve olmayan hesapta aynı hata');
const bad1 = await login(email, 'yanlis-parola');
const bad2 = await login(`yok${tag}@ornek.test`, 'yanlis-parola');
ok(bad1.status === 401 && bad2.status === 401 && JSON.stringify(bad1.data.message) === JSON.stringify(bad2.data.message), `aynı yanıt: ${bad1.status}/${bad2.status} "${bad1.data.message}"`);
const time = async (fn) => { const t = performance.now(); await fn(); return performance.now() - t; };
await login(email, 'x'); // ısınma
const tExist = (await Promise.all([1, 2, 3].map(() => time(() => login(email, 'yanlis'))))).reduce((a, b) => a + b) / 3;
const tMissing = (await Promise.all([1, 2, 3].map(() => time(() => login(`yok${tag}@ornek.test`, 'yanlis'))))).reduce((a, b) => a + b) / 3;
ok(tMissing > tExist * 0.5, `var olmayan hesap da bcrypt süresi harcar (olan ${tExist.toFixed(0)} ms, olmayan ${tMissing.toFixed(0)} ms)`);

console.log('3) Pasif hesap');
const dis = await call('PATCH', `/users/${userId}`, { token: owner, body: { isActive: false } });
ok(dis.status === 200, 'hesap pasife alındı');
ok((await call('GET', '/auth/me', { token: fresh.data.accessToken })).status === 401, 'pasif hesabın oturumu düşer');
ok((await login(email, 'Yeni-Parola-9876')).status === 401, 'pasif hesap giriş yapamaz');

console.log(failures ? `\n${failures} adım BAŞARISIZ` : '\nHepsi geçti ✔');
process.exit(failures ? 1 : 0);
