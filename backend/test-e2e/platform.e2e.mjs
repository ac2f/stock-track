// Kiralanabilir çok işletmeli yapı + rehber + müşteri ağı: uçtan uca (gerçek API + Postgres + Redis).
// Çalıştırma: API=http://localhost:3000/api/v1 node test-e2e/platform.e2e.mjs
// Ön koşul: çalışan API, owner@stocktrack.local / Owner123! (tohum hesabı).
import { execSync } from 'node:child_process';
const BASE = process.env.API ?? 'http://localhost:3000/api/v1';
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
async function call(method, path, { token, shop, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d?.data ?? d, raw: d, xcache: res.headers.get('x-cache'), retry: res.headers.get('retry-after') };
}
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.accessToken;
const tag = Date.now().toString(36).slice(-5);
// Her çalıştırma kendi telefonunu kullanır (önceki çalıştırmaların müşterileri karışmasın).
const ph10 = '5' + String(Date.now()).slice(-9);           // 10 hane
const phNat = `0${ph10}`, phIntl = `+90 ${ph10.slice(0, 3)} ${ph10.slice(3, 6)} ${ph10.slice(6, 8)} ${ph10.slice(8)}`;
const phFmt = `0 (${ph10.slice(0, 3)}) ${ph10.slice(3, 6)}-${ph10.slice(6, 8)}-${ph10.slice(8)}`;
const phNorm = `90${ph10}`;
// Önceki çalıştırmaların hız sınırı sayaçlarını temizlemek için (bu deneme çok kayıt açar ve
// hız sınırını bilerek aşar) E2E_RATE_LIMIT_FLUSH ortam değişkenine bir komut verin, örn.:
//   E2E_RATE_LIMIT_FLUSH="redis-cli -a PAROLA --scan --pattern 'st:rl:*' | xargs -r redis-cli -a PAROLA del"
if (process.env.E2E_RATE_LIMIT_FLUSH) {
  try { execSync(process.env.E2E_RATE_LIMIT_FLUSH, { stdio: 'ignore', shell: '/bin/sh' }); } catch {}
}

const owner = await login('owner@stocktrack.local', 'Owner123!');

console.log('1) Yönetici: etiketler');
const mk = async (name, description) => (await call('POST', '/platform/labels', { token: owner, body: { name: `${name} ${tag}`, description } })).data;
const lLaser = await mk('Lazer Kesim', 'Lazer ile kesim/gravür');
const lCnc = await mk('CNC Router', 'CNC ile işleme');
const lSign = await mk('Tabela ve Reklam', 'Tabela, kutu harf');
ok(lLaser?.id && lCnc?.id && lSign?.id, `3 etiket açıldı`);
const dup = await call('POST', '/platform/labels', { token: owner, body: { name: `lazer kesim ${tag}` } });
ok(dup.status === 409, `aynı ad (büyük/küçük harf farkıyla) reddedildi: ${dup.status}`);
const upd = await call('PATCH', `/platform/labels/${lSign.id}`, { token: owner, body: { description: 'Tabela, kutu harf, vinil' } });
ok(upd.status === 200 && upd.data.description.includes('vinil'), 'etiket güncellendi');
const pub = await call('GET', '/registration/options');
ok(pub.status === 200 && pub.data.labels.some((l) => l.id === lLaser.id) && pub.data.open === true, `kayıt seçenekleri herkese açık: ${pub.data.labels.length} etiket`);

console.log('2) Yönetici: makine türleri (alt kategoriler) ve ebatlar');
const mt = async (name, parentId) => (await call('POST', '/platform/machine-types', { token: owner, body: { name: `${name} ${tag}`, parentId } })).data;
const tLaser = await mt('Lazer');
const tCo2 = await mt('CO2 Lazer', tLaser.id);
const tFiber = await mt('Fiber Lazer', tLaser.id);
const tCnc = await mt('CNC Router');
ok(tFiber.path.includes('›') && tFiber.depth === 1, `ağaç: ${tFiber.path}`);
const cyc = await call('PATCH', `/platform/machine-types/${tLaser.id}`, { token: owner, body: { parentId: tFiber.id } });
ok(cyc.status === 400, `bir tür kendi alt türünün altına taşınamaz: ${cyc.status}`);
const sz = async (id, w, h) => (await call('POST', `/platform/machine-types/${id}/sizes`, { token: owner, body: { widthMm: w, heightMm: h } }));
const f1 = await sz(tFiber.id, 1300, 900);
await sz(tFiber.id, 1500, 3000);
const c1 = await sz(tCnc.id, 1325, 2500);
await sz(tCnc.id, 1500, 3000);
const dsz = await sz(tCnc.id, 1325, 2500);
ok(dsz.status === 409, `aynı ebat tekrar eklenemez: ${dsz.status}`);
const fiberSizes = f1.data.sizes;
const cncType = (await call('GET', '/platform/machine-types', { token: owner })).data.find((t) => t.id === tCnc.id);
ok(fiberSizes.length >= 1 && cncType.sizes.length === 2, `ebatlar: fiber ${f1.data.sizes.length}, cnc ${cncType.sizes.length}`);

console.log('3) Kayıt: doğrulamalar');
const base = (over = {}) => ({ businessName: `Atölye ${tag}`, ownerName: 'Ayşe Demir', email: `a${tag}@test.local`, phone: '0532 111 22 33', password: 'Parola1234!', province: 'istanbul', district: 'kadikoy', labelIds: [lLaser.id], acceptTerms: true, ...over });
let r = await call('POST', '/registration', { body: base({ acceptTerms: false }) });
ok(r.status === 400, `koşullar kabul edilmeden kayıt olmaz: ${r.status}`);
r = await call('POST', '/registration', { body: base({ labelIds: [] }) });
ok(r.status === 400, `etiketsiz kayıt olmaz: ${r.status}`);
r = await call('POST', '/registration', { body: base({ province: 'Gotham' }) });
ok(r.status === 400, `bilinmeyen il reddedilir: ${r.status} ${r.raw?.message}`);
r = await call('POST', '/registration', { body: base({ district: 'Çankaya' }) });
ok(r.status === 400, `ile ait olmayan ilçe reddedilir: ${r.status}`);
r = await call('POST', '/registration', { body: base({ password: '123' }) });
ok(r.status === 400, `kısa parola reddedilir: ${r.status}`);
r = await call('POST', '/registration', { body: base({ labelIds: ['00000000-0000-4000-8000-000000000009'] }) });
ok(r.status === 404, `olmayan etiket reddedilir: ${r.status}`);

console.log('4) Kayıt: işletme A (onay bekler)');
r = await call('POST', '/registration', { body: base() });
ok(r.status === 201 && r.data.status === 'pending' && !r.data.auth, `kayıt alındı, onay bekliyor: ${r.status} ${r.data?.status}`);
const A = r.data.shop.id;
const dupMail = await call('POST', '/registration', { body: base({ businessName: 'Başka' }) });
ok(dupMail.status === 409, `aynı e-posta ikinci kez kayıt olamaz: ${dupMail.status}`);
const tokA = await login(`A${tag}@TEST.local`, 'Parola1234!');
ok(!!tokA, 'e-posta büyük/küçük harf fark etmeden giriş yapılır');
const me = await call('GET', '/auth/me', { token: tokA });
const mine = me.data.shops.find((s) => s.id === A);
ok(mine?.status === 'pending' && me.data.shops.length === 1 && mine.isAdmin, `/auth/me: durum pending, yönetici: ${JSON.stringify({ s: mine?.status, a: mine?.isAdmin })}`);
const blocked = await call('GET', '/warehouses', { token: tokA, shop: A });
ok(blocked.status === 403 && /onay/.test(blocked.raw.message), `onaysız hesap sisteme giremez: ${blocked.status} "${blocked.raw.message}"`);

console.log('5) Yönetici: onay + kiralama');
const list = await call('GET', '/platform/businesses?status=pending', { token: owner });
const row = list.data.items.find((b) => b.id === A);
ok(row && row.province === 'İstanbul' && row.district === 'Kadıköy' && row.admins[0]?.email === `a${tag}@test.local`, `bekleyenlerde görünür: ${row?.province}/${row?.district}`);
ok(row.labels.length === 1 && row.memberCount === 1, `etiket ve üye sayısı: ${row.labels} ${row.memberCount}`);
const nonOwner = await call('GET', '/platform/businesses', { token: tokA });
ok(nonOwner.status === 403, `işletme yöneticisi platform ekranını göremez: ${nonOwner.status}`);
const appr = await call('POST', `/platform/businesses/${A}/approve`, { token: owner });
ok(appr.status === 200 && appr.data.status === 'active' && appr.data.daysLeft >= 13, `onaylandı, deneme: ${appr.data.plan} ${appr.data.daysLeft} gün`);
const wh = await call('GET', '/warehouses', { token: tokA, shop: A });
ok(wh.status === 200, `onaydan sonra giriş: ${wh.status}`);

console.log('6) Yalıtım: yeni işletme BOŞ başlar, başkasının verisini görmez');
const platesA = await call('GET', '/plates?limit=50', { token: tokA, shop: A });
const custA = await call('GET', '/customers?limit=50', { token: tokA, shop: A });
const salesA = await call('GET', '/sales?limit=50', { token: tokA, shop: A });
ok(platesA.data.items.length === 0 && custA.data.items.length === 0 && salesA.data.items.length === 0, `stok/müşteri/satış boş: ${platesA.data.items.length}/${custA.data.items.length}/${salesA.data.items.length}`);
const opShop = (await call('GET', '/auth/me', { token: owner })).data.shops[0].id;
const cross = await call('GET', '/customers', { token: tokA, shop: opShop });
ok(cross.status === 403, `başka işletmenin verisine X-Shop-Id ile erişilemez: ${cross.status}`);
const cats = await call('GET', '/material-categories', { token: tokA, shop: A });
ok(cats.status === 200 && cats.data.length > 0, `kendi başlangıç kataloğu var: ${cats.data.length} tür`);
const tokOwnerPlates = await call('GET', '/plates?limit=1', { token: owner, shop: opShop });
ok(tokOwnerPlates.data.items.length >= 0, 'yönetici kendi dükkânını görür');

console.log('7) Kayıt: işletme B (otomatik onay açıkken anında etkin)');
const setAuto = await call('PATCH', '/platform/settings', { token: owner, body: { registrationAutoApprove: true, trialDays: 30 } });
ok(setAuto.status === 200 && setAuto.data.registrationAutoApprove === true, 'otomatik onay açıldı');
r = await call('POST', '/registration', { body: base({ businessName: `Router ${tag}`, ownerName: 'Mehmet Kaya', email: `b${tag}@test.local`, phone: '0312 555 44 33', province: 'Ankara', district: 'Çankaya', labelIds: [lCnc.id, lSign.id] }) });
ok(r.status === 201 && r.data.status === 'active' && !!r.data.auth?.accessToken, `anında etkin ve oturum açık: ${r.data?.status}`);
const B = r.data.shop.id;
const tokB = r.data.auth.accessToken;
await call('PATCH', '/platform/settings', { token: owner, body: { registrationAutoApprove: false, trialDays: 14 } });
const closed = await call('PATCH', '/platform/settings', { token: owner, body: { registrationOpen: false } });
const rc = await call('POST', '/registration', { body: base({ email: `c${tag}@test.local` }) });
ok(rc.status === 403, `kayıt kapalıyken yeni kayıt olmaz: ${rc.status}`);
await call('PATCH', '/platform/settings', { token: owner, body: { registrationOpen: true } });

console.log('8) İşletme profili ve makineler');
const prof = await call('GET', '/business-profile', { token: tokA, shop: A });
ok(prof.status === 200 && prof.data.directoryVisible === true && prof.data.labelIds.includes(lLaser.id), `profil: ${prof.data.province}/${prof.data.district}, etiket ${prof.data.labels.map((l) => l.name)}`);
const pu = await call('PATCH', '/business-profile', { token: tokA, shop: A, body: { description: 'Fiber lazer ile hassas kesim', addressLine: 'Moda Cd. 12', website: 'https://atolye.example', labelIds: [lLaser.id, lSign.id] } });
ok(pu.status === 200 && pu.data.labels.length === 2, `profil güncellendi, etiketler: ${pu.data.labels.length}`);
const badProv = await call('PATCH', '/business-profile', { token: tokA, shop: A, body: { province: 'Mars' } });
ok(badProv.status === 400, `profilde de il listeden seçilmeli: ${badProv.status}`);
const mkMachine = (tok, shop, body) => call('POST', '/machines', { token: tok, shop, body });
const fiberType = (await call('GET', '/directory/machine-types', { token: tokA, shop: A })).data.find((t) => t.id === tFiber.id);
const fiberSize = fiberType.sizes.find((s) => s.widthMm === 1300);
const mA = await mkMachine(tokA, A, { name: 'Fiber 3kW', code: 'FIB', machineTypeId: tFiber.id, sizeId: fiberSize.id, brand: 'Bodor', model: 'P3015', quantity: 1 });
ok(mA.status === 201 && mA.data.workWidthMm === 1300 && mA.data.workHeightMm === 900, `A makinesi ebattan ölçüyü aldı: ${mA.data.workWidthMm}x${mA.data.workHeightMm}`);
const wrongSize = await mkMachine(tokA, A, { name: 'Yanlış Ebat', code: 'XX', machineTypeId: tCnc.id, sizeId: fiberSize.id });
ok(wrongSize.status === 400, `başka türün ebadı reddedilir: ${wrongSize.status}`);
const noType = await mkMachine(tokA, A, { name: 'Yanlış Tür', code: 'YY', machineTypeId: '00000000-0000-4000-8000-000000000009' });
ok(noType.status === 404, `olmayan tür reddedilir: ${noType.status}`);
const half = await mkMachine(tokA, A, { name: 'Yarım Ölçü', code: 'ZZ', workWidthMm: 500 });
ok(half.status === 400, `en var boy yok reddedilir: ${half.status}`);
const mA2 = await mkMachine(tokA, A, { name: 'CO2 60W', code: 'CO2', machineTypeId: tCo2.id, workWidthMm: 600, workHeightMm: 400, brand: 'Trotec' });
ok(mA2.status === 201, 'A ikinci makine (özel ebat)');
const cncSize = cncType.sizes.find((s) => s.widthMm === 1325);
const mB = await mkMachine(tokB, B, { name: 'Router 1', code: 'RT1', machineTypeId: tCnc.id, sizeId: cncSize.id, brand: 'Elmo' });
ok(mB.status === 201, 'B makinesi');
const mBhidden = await mkMachine(tokB, B, { name: 'Gizli Router', code: 'RT2', machineTypeId: tCnc.id, workWidthMm: 3000, workHeightMm: 1500, isPublic: false });
ok(mBhidden.status === 201, 'B herkese açık olmayan makine');

console.log('9) Rehber: il/ilçe, etiket, makine türü ve ebat ile arama');
const dirB = (q) => call('GET', `/directory/shops?${q}`, { token: tokB, shop: B });
let d = await dirB(`labelIds=${lLaser.id}`);
const a = d.data.items.find((s) => s.id === A);
ok(a && a.phone === '0532 111 22 33' && a.addressLine === 'Moda Cd. 12' && a.email === `a${tag}@test.local`, `etiketle bulundu + iletişim bilgisi görünür: ${a?.name}`);
ok(a.labels.length === 2 && a.machines.length === 2, `etiketler ve makineler: ${a.labels.length} / ${a.machines.length}`);
ok(!d.data.items.some((s) => s.id === B), 'B etiketine uymadığı için B listede yok');
// Önceki çalıştırmalardan kalan işletmeler aynı ilçede olduğundan kendi etiketimizle daraltılır (sayfa 1'e sığsın).
d = await dirB(`province=Istanbul&district=Kadikoy&labelIds=${lLaser.id}`);
ok(d.data.items.some((s) => s.id === A), `il/ilçe (yazım farkıyla): ${d.data.meta.total}`);
d = await dirB(`province=Ankara`);
ok(!d.data.items.some((s) => s.id === A) && d.data.items.some((s) => s.id === B), 'Ankara: A yok, B var');
d = await dirB(`province=İstanbul&district=Beşiktaş`);
ok(!d.data.items.some((s) => s.id === A), 'yanlış ilçe: A yok');
d = await dirB(`machineTypeId=${tLaser.id}`);
ok(d.data.items.some((s) => s.id === A), `üst tür (Lazer) alt türdeki (Fiber/CO2) makineyi de bulur`);
d = await dirB(`machineTypeId=${tFiber.id}&minWidthMm=1000&minHeightMm=800`);
ok(d.data.items.some((s) => s.id === A) && d.data.items.find((s) => s.id === A).machines.find((m) => m.matches)?.name === 'Fiber 3kW', 'en az 1000×800: fiber 1300×900 uyar ve işaretlenir');
d = await dirB(`machineTypeId=${tFiber.id}&minWidthMm=900&minHeightMm=1300`);
ok(d.data.items.some((s) => s.id === A), 'ters çevrilerek de sığar (900×1300)');
d = await dirB(`machineTypeId=${tFiber.id}&minWidthMm=1400&minHeightMm=1000`);
ok(!d.data.items.some((s) => s.id === A), 'en az 1400×1000: fiber 1300×900 yetmez');
d = await dirB(`machineTypeId=${tCnc.id}&minWidthMm=2800&minHeightMm=1400`);
ok(!d.data.items.some((s) => s.id === B), 'gizli (herkese açık olmayan) makine aramada sayılmaz');
d = await dirB(`q=lazer`);
ok(d.data.items.some((s) => s.id === A), `serbest arama (açıklama/etiket): ${d.data.meta.total}`);
// Etiket adı her çalıştırmada aynı olduğundan, önceki çalıştırmaların işletmeleri sayfayı doldurmasın diye
// bu çalıştırmanın etiketiyle daraltılır (arama yine ETİKET ADI üzerinden yapılır).
d = await dirB(`q=${encodeURIComponent('Tabela')}&labelIds=${lSign.id}`);
ok(d.data.items.some((s) => s.id === A) && d.data.items.some((s) => s.id === B), 'etiket adıyla arama (iki işletme)');
const mh = await call('GET', `/directory/machines?machineTypeId=${tLaser.id}&minWidthMm=500&minHeightMm=300`, { token: tokB, shop: B });
ok(mh.data.items.length === 2 && mh.data.items.every((m) => m.shop.id === A && m.shop.phone), `makine araması: ${mh.data.items.map((m) => m.name)}`);
const fx = await call('GET', '/directory/facets?province=Istanbul', { token: tokB, shop: B });
ok(fx.data.provinces.some((p) => p.name === 'İstanbul' && p.count >= 1) && fx.data.districts.some((x) => x.name === 'Kadıköy') && fx.data.labels.find((l) => l.id === lLaser.id)?.count >= 1, `süzgeç sayıları: ${JSON.stringify(fx.data.provinces.map((p) => p.name + p.count))}`);
ok(fx.data.machineTypes.find((t) => t.id === tLaser.id)?.count >= 2, 'üst tür sayısı alt türleri kapsar');

console.log('10) Rehber görünürlüğü ve önbellek tutarlılığı');
const hide = await call('PATCH', '/business-profile', { token: tokA, shop: A, body: { directoryVisible: false } });
d = await dirB(`labelIds=${lLaser.id}`);
ok(hide.status === 200 && !d.data.items.some((s) => s.id === A), `rehberden çıkınca ANINDA kaybolur (önbellek bayat değil): ${d.xcache}`);
await call('PATCH', '/business-profile', { token: tokA, shop: A, body: { directoryVisible: true } });
d = await dirB(`labelIds=${lLaser.id}`);
ok(d.data.items.some((s) => s.id === A), 'geri açılınca ANINDA görünür');
// Yazıdan hemen sonra başlayan okuma bilerek saklanmaz (saat kayması payı: yazıya yetişen okuma bayat olabilir).
// Bu yüzden kısa bir bekleme + ısınma okumasından sonra tekrar okumanın önbellekten geldiği doğrulanır.
await new Promise((r) => setTimeout(r, 400));
await dirB(`labelIds=${lLaser.id}`);
d = await dirB(`labelIds=${lLaser.id}`);
ok(d.xcache === 'HIT', `tekrar okuma önbellekten: ${d.xcache}`);
await call('PATCH', `/machines/${mA2.data.id}`, { token: tokA, shop: A, body: { isPublic: false } });
const mh2 = await call('GET', `/directory/machines?machineTypeId=${tLaser.id}`, { token: tokB, shop: B });
ok(mh2.data.items.length === 1, `makine gizlenince aramadan ANINDA çıkar: ${mh2.data.items.length}`);
await call('PATCH', `/platform/labels/${lLaser.id}`, { token: owner, body: { name: `Lazer Kesim Atölyesi ${tag}` } });
d = await dirB(`labelIds=${lLaser.id}`);
ok(d.data.items.find((s) => s.id === A)?.labels.some((l) => l.name.startsWith('Lazer Kesim Atölyesi')), 'etiket adı değişince rehberde anında yeni ad');

console.log('11) Askıya alma ve kiralama süresi');
await call('PATCH', `/platform/businesses/${A}`, { token: owner, body: { subscriptionUntil: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10) } });
const readOk = await call('GET', '/warehouses', { token: tokA, shop: A });
const writeBlocked = await call('POST', '/material-categories', { token: tokA, shop: A, body: { name: `Yeni ${tag}`, code: `Y${tag}`, defaultMeasurementType: 'area' } });
ok(readOk.status === 200 && writeBlocked.status === 403 && /Kiralama/.test(writeBlocked.raw.message), `süresi dolmuş: okuma ${readOk.status}, yazma ${writeBlocked.status} "${writeBlocked.raw.message?.slice(0, 40)}"`);
const meExp = await call('GET', '/auth/me', { token: tokA });
ok(meExp.data.shops[0].expired === true, 'auth/me: expired=true');
const ext = await call('PATCH', `/platform/businesses/${A}`, { token: owner, body: { extendDays: 30 } });
const writeOk = await call('POST', '/material-categories', { token: tokA, shop: A, body: { name: `Yeni ${tag}`, code: `Y${tag}`, defaultMeasurementType: 'area' } });
ok(ext.data.daysLeft >= 29 && writeOk.status === 201, `30 gün uzatınca yazma açılır: ${ext.data.daysLeft} gün, ${writeOk.status}`);
await call('PATCH', `/platform/businesses/${A}`, { token: owner, body: { status: 'suspended' } });
const susp = await call('GET', '/warehouses', { token: tokA, shop: A });
d = await dirB(`labelIds=${lLaser.id}`);
ok(susp.status === 403 && /askıya/.test(susp.raw.message) && !d.data.items.some((s) => s.id === A), `askıya alınan: giriş ${susp.status}, rehberde yok`);
await call('PATCH', `/platform/businesses/${A}`, { token: owner, body: { status: 'active' } });
const back = await call('GET', '/warehouses', { token: tokA, shop: A });
ok(back.status === 200, 'tekrar etkinleştirilince giriş açılır');

console.log('12) Müşteri ağı: aynı telefon → öneri + borç uyarısı (tutar GİZLİ)');
// A'da müşteri + 45 gün önceki borç
const shareA = await call('PATCH', '/business-profile', { token: tokA, shop: A, body: { shareDebtInfo: true, shareCustomerInfo: true } });
ok(shareA.status === 200 && shareA.data.shareDebtInfo === true, 'A ağa katıldı');
const cA = await call('POST', '/customers', { token: tokA, shop: A, body: { name: 'Ali Veli', companyName: 'Veli Reklam Ltd.', phone: phFmt, email: 'ali@veli.example', address: 'Kadıköy, İstanbul', taxNumber: '1234567890' } });
ok(cA.status === 201, `A'da müşteri: ${cA.status} ${cA.raw?.message ?? ''}`);
const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
await call('POST', `/customers/${cA.data.id}/ledger-entry`, { token: tokA, shop: A, body: { entryType: 'debit', amount: 1500, occurredAt: day(45), description: 'Eski iş 1' } });
await call('POST', `/customers/${cA.data.id}/ledger-entry`, { token: tokA, shop: A, body: { entryType: 'debit', amount: 800, occurredAt: day(10), description: 'Eski iş 2' } });
const look = (phone, tok = tokB, shop = B) => call('GET', `/customer-network/lookup?phone=${encodeURIComponent(phone)}`, { token: tok, shop });
let lk = await look(phIntl);
ok(lk.status === 200 && lk.data.phone === phNorm, `telefon eşleşme biçimine çevrildi: ${lk.data.phone}`);
ok(lk.data.suggestion?.name === 'Ali Veli' && lk.data.suggestion.companyName === 'Veli Reklam Ltd.' && lk.data.suggestion.taxNumber === '1234567890' && lk.data.suggestion.sources === 1, `bilgi önerisi: ${JSON.stringify(lk.data.suggestion)}`);
const w = lk.data.debtWarnings;
ok(w.length === 1 && w[0].shopName === `Atölye ${tag}` && w[0].ageDays >= 44 && w[0].ageDays <= 46 && w[0].bucket === '31-60' && w[0].openItems === 2, `borç uyarısı: ${JSON.stringify(w)}`);
const dumped = JSON.stringify(lk.data);
ok(!/1500|800|2300|amount|balance|total|tutar/i.test(dumped), 'yanıtta TUTAR bilgisi YOK');
ok(!/ledger|notes|telegram|portal|opening/i.test(dumped), 'bakiye/not/portal gibi alanlar paylaşılmaz');
const selfLook = await look(phNat, tokA, A);
ok(selfLook.data.debtWarnings.length === 0 && selfLook.data.suggestion === null && selfLook.data.own?.id === cA.data.id, 'kendi işletmeniz uyarı/öneri almaz; kendi kaydı "own" döner');
// Kısmi ödeme: FIFO → en eski borç kapanır, yaş 10 güne iner
await call('POST', `/customers/${cA.data.id}/ledger-entry`, { token: tokA, shop: A, body: { entryType: 'credit', amount: 1500, occurredAt: day(5), description: 'Kısmi ödeme' } });
lk = await look(phNat);
ok(lk.data.debtWarnings.length === 1 && lk.data.debtWarnings[0].ageDays >= 9 && lk.data.debtWarnings[0].ageDays <= 11 && lk.data.debtWarnings[0].openItems === 1, `kısmi ödeme sonrası yaş en eski ÖDENMEMİŞ borca göre: ${lk.data.debtWarnings[0]?.ageDays} gün`);
// Tam ödeme → uyarı kalkar, öneri kalır
await call('POST', `/customers/${cA.data.id}/ledger-entry`, { token: tokA, shop: A, body: { entryType: 'credit', amount: 800, occurredAt: day(1), description: 'Kalan' } });
lk = await look(phNat);
ok(lk.data.debtWarnings.length === 0 && lk.data.suggestion?.name === 'Ali Veli', 'borç kapanınca uyarı kalkar, bilgi önerisi sürer');
await call('POST', `/customers/${cA.data.id}/ledger-entry`, { token: tokA, shop: A, body: { entryType: 'debit', amount: 99, occurredAt: day(3), description: 'Yeni' } });
// Karşılıklılık
const offB = await call('PATCH', '/business-profile', { token: tokB, shop: B, body: { shareDebtInfo: false, shareCustomerInfo: false } });
lk = await look(phNat);
ok(offB.status === 200 && lk.data.debtWarnings.length === 0 && lk.data.suggestion === null && lk.data.network.debtInfo === false, 'B ağdan çıkınca kendisi de uyarı/öneri görmez (karşılıklılık)');
await call('PATCH', '/business-profile', { token: tokB, shop: B, body: { shareDebtInfo: true, shareCustomerInfo: true } });
lk = await look(phNat);
ok(lk.data.debtWarnings.length === 1, 'B tekrar katılınca uyarı döner');
await call('PATCH', '/business-profile', { token: tokA, shop: A, body: { shareDebtInfo: false, shareCustomerInfo: false } });
lk = await look(phNat);
ok(lk.data.debtWarnings.length === 0 && lk.data.suggestion === null, 'A ağdan çıkınca A\'nın borç/müşteri bilgisi paylaşılmaz');
await call('PATCH', '/business-profile', { token: tokA, shop: A, body: { shareDebtInfo: true, shareCustomerInfo: true } });

console.log('13) Müşteri kaydı: bilgiler farklı kaydedilebilir, kartta uyarı görünür');
const cB = await call('POST', '/customers', { token: tokB, shop: B, body: { name: 'Ali V. (farklı ad)', phone: phIntl, address: 'Çankaya, Ankara' } });
ok(cB.status === 201, `B önerilenden FARKLI bilgiyle kaydedebilir: ${cB.status} ${cB.data?.name}`);
lk = await look(phNat);
ok(lk.data.own?.id === cB.data.id, 'B aynı telefonla tekrar girerse "kendi kaydı" uyarısı');
const risk = await call('GET', `/customer-network/customers/${cB.data.id}`, { token: tokB, shop: B });
ok(risk.status === 200 && risk.data.debtWarnings.length === 1 && !/amount|balance|tutar/i.test(JSON.stringify(risk.data)), `müşteri kartı uyarısı: ${risk.data.debtWarnings[0]?.shopName} ${risk.data.debtWarnings[0]?.ageDays} gün`);
const cBget = await call('GET', `/customers/${cB.data.id}`, { token: tokB, shop: B });
ok(cBget.data.phoneNormalized === phNorm, 'phoneNormalized saklandı');
const edit = await call('PATCH', `/customers/${cB.data.id}`, { token: tokB, shop: B, body: { phone: '0533 ' + String(Date.now()).slice(-7) } });
const risk2 = await call('GET', `/customer-network/customers/${cB.data.id}`, { token: tokB, shop: B });
ok(edit.status === 200 && risk2.data.debtWarnings.length === 0, 'telefon değişince uyarı yeni numaraya göre');
const short = await look('12');
ok(short.data.phone === null && short.data.debtWarnings.length === 0, 'çok kısa numara eşleştirilmez');
const noWrite = await call('POST', '/shops/' + B + '/members', { token: tokB, body: { newUser: { fullName: 'Okur', email: `r${tag}@test.local`, password: 'Okur12345!' }, permissions: { customers: { read: true, write: false } } } });
const tokR = await login(`r${tag}@test.local`, 'Okur12345!');
const rl = await look(phNat, tokR, B);
ok(noWrite.status === 201 && rl.status === 403, `yazma izni olmayan üye telefon sorgusu yapamaz: ${rl.status}`);

console.log('14) Hız sınırı');
let last;
for (let i = 0; i < 45; i++) last = await look(phNat);
ok(last.status === 429 && Number(last.retry) > 0, `dakikada 40 sorgudan sonra 429 + Retry-After: ${last.status} ${last.retry}`);
let lock;
for (let i = 0; i < 52; i++) lock = await call('POST', '/auth/login', { body: { email: `kilit${tag}@test.local`, password: 'yanlis' } });
ok(lock.status === 429, `aynı hesaba çok yanlış giriş: 429 (${lock.status})`);
const stillOk = await login('owner@stocktrack.local', 'Owner123!');
ok(!!stillOk, 'başka hesabın girişi etkilenmez');

console.log(failures ? `\n${failures} HATA` : '\nTümü geçti');
process.exit(failures ? 1 : 0);
