// Kırmızı takım: HER uç, farklı kimliklerle denenir (yönetici olmayan, başka işletme, okuma-yazma ayrımı).
//
// Uç listesi elle yazılmaz: derlenmiş denetleyicilerin meta verisinden çıkarılır (yeni eklenen uç
// kendiliğinden kapsama girer). Her uç için beklenti, ShopAccessGuard'ın kendi kuralından türetilir:
//   - oturumsuz           → herkese açık olmayan her uç 401
//   - başka işletmenin üyesi, X-Shop-Id: <kurban dükkân> → dükkâna bağlı her uç 403
//   - sistem sahibine özel uç (@Roles OWNER) → hiçbir işletme kullanıcısı giremez (403)
//   - izinsiz çalışan → alan izni isteyen her uç 403 (yalnız "dükkânın her üyesi" uçları açık)
//   - salt-okur çalışan → yazma isteyen her uç 403
//   - Corel/rehber/ağ/ticaret özelliği KAPALI işletme → ilgili uçlar 403
//   - hiçbir istek 5xx vermemeli
//
// Çalıştırma (derlenmiş dist gerekir):  cd backend && npx nest build &&
//   API=http://localhost:3000/api/v1 node test-e2e/access-matrix.e2e.mjs
// Ön koşul: çalışan API (NODE_ENV=development), owner@stocktrack.local / Owner123!
import { createRequire } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '..', 'dist');
require('reflect-metadata');
const { Reflector } = require('@nestjs/core');
const { PATH_METADATA, METHOD_METADATA, VERSION_METADATA, GUARDS_METADATA } = require('@nestjs/common/constants');
const { ShopAccessGuard } = require(join(DIST, 'modules/shops/shop-access.guard.js'));
const { IS_PUBLIC_KEY } = require(join(DIST, 'common/decorators/public.decorator.js'));
const { ROLES_KEY } = require(join(DIST, 'common/decorators/roles.decorator.js'));
const { SHOP_FEATURE_KEY } = require(join(DIST, 'common/shop/shop-access.decorator.js'));

const BASE = process.env.API ?? 'http://localhost:3000/api/v1';
const REST_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];
const DUMMY = '00000000-0000-4000-8000-0000000000ff';
let failures = 0;
const fails = [];
const bad = (msg) => { failures++; fails.push(msg); };

// ── Uç listesi (meta veriden) ──────────────────────────────────────────
function controllerFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.js') ? [full] : [];
  });
}
const reflector = new Reflector();
const flat = (v) => (Array.isArray(v) ? v : [v]);
function collectRoutes() {
  const routes = [];
  for (const file of controllerFiles(join(DIST, 'modules')).concat(controllerFiles(join(DIST, 'common')), [join(DIST, 'health.controller.js')])) {
    const mod = require(file);
    for (const cls of Object.values(mod)) {
      if (typeof cls !== 'function') continue;
      const cpath = Reflect.getMetadata(PATH_METADATA, cls);
      if (cpath === undefined) continue;
      for (const key of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = cls.prototype[key];
        if (key === 'constructor' || typeof handler !== 'function') continue;
        const m = Reflect.getMetadata(METHOD_METADATA, handler);
        if (m === undefined) continue;
        const method = REST_METHODS[m];
        const mpath = Reflect.getMetadata(PATH_METADATA, handler);
        const version = Reflect.getMetadata(VERSION_METADATA, cls) ?? '1';
        const full = ['/', ...flat(cpath), '/', ...flat(mpath)].join('/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const ctx = { getHandler: () => handler, getClass: () => cls };
        const isPublic = !!reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, cls]);
        // Herkese açık ama kendi anahtar korumasıyla (Corel anahtarı, yerel sunucu jetonu) kapalı uçlar.
        const keyGuarded = isPublic && ((Reflect.getMetadata(GUARDS_METADATA, cls) ?? []).length > 0 || (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []).length > 0);
        const roles = reflector.getAllAndOverride(ROLES_KEY, [handler, cls]) ?? [];
        const feature = reflector.getAllAndOverride(SHOP_FEATURE_KEY, [handler, cls]) ?? null;
        let required;
        let undefinedAccess = false;
        try {
          required = ShopAccessGuard.required(reflector, ctx, method);
        } catch {
          undefinedAccess = true;
        }
        routes.push({ name: `${cls.name}.${key}`, method, path: full.replace(/:\w+/g, DUMMY), template: full, version, isPublic, keyGuarded, roles, feature, required, undefinedAccess });
      }
    }
  }
  return routes;
}

// ── HTTP ───────────────────────────────────────────────────────────────
async function call(method, path, { token, shop, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d?.data ?? d, raw: t };
}
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.accessToken;
const tag = Date.now().toString(36).slice(-5);

async function register(name, labelId) {
  const email = `${name.toLowerCase()}${tag}@ornek.test`;
  const r = await call('POST', '/registration', {
    body: { businessName: `${name} ${tag}`, ownerName: `${name} Sahibi`, email, phone: '05321112233', password: 'Parola-12345', province: 'İstanbul', district: 'Kadıköy', labelIds: [labelId], acceptTerms: true },
  });
  const shopId = r.data?.shop?.id;
  return { email, shopId };
}

// ── Kimlikler ──────────────────────────────────────────────────────────
const owner = await login('owner@stocktrack.local', 'Owner123!');
if (!owner) { console.log('Sistem sahibi girişi yapılamadı'); process.exit(2); }
const label = (await call('POST', '/platform/labels', { token: owner, body: { name: `Matris ${tag}`, description: 'x' } })).data;
const A = await register('MatrisA', label.id);
const B = await register('MatrisB', label.id);
for (const s of [A, B]) await call('POST', `/platform/businesses/${s.shopId}/approve`, { token: owner });
A.token = await login(A.email, 'Parola-12345');
B.token = await login(B.email, 'Parola-12345');

const noPerm = Object.fromEntries(['stock', 'catalog', 'purchases', 'processing', 'quotes', 'sales', 'customers', 'payments', 'expenses', 'banking', 'reports', 'settings'].map((m) => [m, { read: false, write: false }]));
const readOnly = Object.fromEntries(Object.keys(noPerm).map((m) => [m, { read: true, write: false }]));
async function employee(label2, permissions) {
  const email = `${label2}${tag}@ornek.test`;
  const r = await call('POST', `/shops/${A.shopId}/members`, { token: A.token, body: { newUser: { fullName: label2, email, password: 'Parola-12345' }, permissions } });
  if (r.status !== 201) bad(`çalışan oluşturulamadı (${label2}): ${r.status} ${r.raw.slice(0, 120)}`);
  return { email, token: await login(email, 'Parola-12345') };
}
const EMP0 = await employee('izinsiz', noPerm);
const READER = await employee('okur', readOnly);
ok(A.token && B.token && EMP0.token && READER.token, 'kimlikler hazır: yönetici A, yönetici B, izinsiz çalışan, salt-okur çalışan');
function ok(c, m) { if (c) console.log('  ✓', m); else { bad(m); console.log('  ✗', m); } }

// ── Uçlar ──────────────────────────────────────────────────────────────
const routes = collectRoutes();
console.log(`\n${routes.length} uç bulundu.`);
const noDef = routes.filter((r) => r.undefinedAccess);
ok(noDef.length === 0, `her ucun yetki tanımı var${noDef.length ? ': ' + noDef.map((r) => r.name).join(', ') : ''}`);

const denied = (s) => s === 401 || s === 403;
const results = { total: 0 };
function check(route, who, res, expect, why) {
  results.total++;
  if (res.status >= 500) return bad(`5xx · ${who} · ${route.method} ${route.path} → ${res.status} (${route.name}) ${res.raw.slice(0, 100)}`);
  if (expect === 'deny' && !denied(res.status)) return bad(`AÇIK · ${who} · ${route.method} ${route.path} → ${res.status} bekleniyordu 401/403 (${why}) [${route.name}]`);
  if (expect === 'anon401' && res.status !== 401) return bad(`AÇIK · oturumsuz · ${route.method} ${route.path} → ${res.status} bekleniyordu 401 [${route.name}]`);
  if (expect === 'allow' && res.status === 401) return bad(`YANLIŞ RED · ${who} · ${route.method} ${route.path} → 401 [${route.name}]`);
}

const bodyFor = (r) => (['POST', 'PUT', 'PATCH'].includes(r.method) ? {} : undefined);
const authOnly = []; // dükkân gerektirmeyen, herkese açık olmayan, sistem sahibine özel olmayan uçlar (elle gözden geçirilir)

for (const r of routes) {
  const body = bodyFor(r);
  const ownerOnly = r.roles.length > 0;
  const shopBound = r.required !== null && !r.isPublic;

  // 1) Oturumsuz
  if (!r.isPublic) check(r, 'oturumsuz', await call(r.method, r.path, { body }), 'anon401');
  else if (r.keyGuarded) check(r, 'anahtarsız', await call(r.method, r.path, { body }), 'deny', 'anahtar koruması');
  else check(r, 'oturumsuz', await call(r.method, r.path, { body }), 'allow');

  if (r.isPublic) continue;

  // 2) Başka işletmenin yöneticisi, kurbanın dükkânını hedefliyor
  const evil = await call(r.method, r.path, { token: B.token, shop: A.shopId, body });
  if (ownerOnly) check(r, 'B yöneticisi', evil, 'deny', 'sistem sahibine özel');
  else if (shopBound) check(r, 'B yöneticisi (X-Shop-Id=A)', evil, 'deny', 'başkasının dükkânı');
  else { check(r, 'B yöneticisi', evil, 'allow'); authOnly.push(`${r.method} ${r.template} [${r.name}] → B: ${evil.status}`); }

  // 3) Sistem sahibine özel uçlarda hiçbir işletme kullanıcısı (yönetici dahil) giremez
  if (ownerOnly) {
    for (const [who, t] of [['A yöneticisi', A.token], ['izinsiz çalışan', EMP0.token], ['salt-okur çalışan', READER.token]]) {
      check(r, who, await call(r.method, r.path, { token: t, shop: A.shopId, body }), 'deny', 'sistem sahibine özel');
    }
    continue;
  }

  // 4) Özellik kapalı işletmede (A'da corel kapalı) özelliğe bağlı uçlar herkese kapalı
  if (r.feature === 'corel') {
    check(r, 'A yöneticisi (corel kapalı)', await call(r.method, r.path, { token: A.token, shop: A.shopId, body }), 'deny', 'özellik kapalı');
    continue;
  }

  if (!shopBound) continue;
  const level = r.required?.level;
  const module = r.required?.module;

  // 5) İzinsiz çalışan: alan izni isteyen her uç kapalı; "dükkânın her üyesi" uçları açık
  const e0 = await call(r.method, r.path, { token: EMP0.token, shop: A.shopId, body });
  check(r, 'izinsiz çalışan', e0, module ? 'deny' : 'allow', `${module}:${level}`);

  // 6) Salt-okur çalışan: yazma isteyen uç kapalı
  const rd = await call(r.method, r.path, { token: READER.token, shop: A.shopId, body });
  check(r, 'salt-okur çalışan', rd, module && level === 'write' ? 'deny' : 'allow', `${module}:${level}`);

  // 7) Yetkili yönetici: 401/403 almamalı (özellik/izin tanımı doğru mu)
  const ad = await call(r.method, r.path, { token: A.token, shop: A.shopId, body });
  check(r, 'A yöneticisi', ad, 'allow');
  if (ad.status === 403 && !/etkin değil/.test(ad.raw)) bad(`YANLIŞ RED · A yöneticisi tam yetkili ama 403: ${r.method} ${r.path} [${r.name}] ${ad.raw.slice(0, 100)}`);
}

console.log(`\n${results.total} istek yapıldı.`);
console.log('\nDükkân gerektirmeyen, herkese açık olmayan uçlar (B yöneticisinin yanıtı) — elle gözden geçir:');
for (const l of authOnly) console.log('  •', l);

console.log(fails.length ? `\n${fails.length} SORUN:\n` + fails.map((f) => ' ✗ ' + f).join('\n') : '\nHer uç her kimlikte beklenen yetkiyle yanıt verdi ✔');
process.exit(fails.length ? 1 : 0);
