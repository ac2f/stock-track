// Dükkânlar arası satış: satan dükkânın stoğu düşer, iptalde geri gelir (gerçek API + Postgres).
// Dükkânlar arası satış + sonraki satış izleme için uçtan uca deneme (gerçek API + Postgres).
const BASE = process.env.API ?? 'http://localhost:3000/api/v1';
let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else {
    failures++;
    console.log('  ✗', msg);
  }
};

async function call(method, path, { token, shop, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data: data?.data ?? data, raw: data };
}

async function login(email, password) {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.raw)}`);
  return r.data.accessToken;
}
const perms = (spec) => {
  const all = ['stock', 'catalog', 'purchases', 'processing', 'quotes', 'sales', 'customers', 'payments', 'expenses', 'banking', 'reports', 'settings'];
  const p = {};
  for (const m of all) p[m] = { read: false, write: false };
  for (const [m, v] of Object.entries(spec)) p[m] = { read: v.includes('r'), write: v.includes('w') };
  return p;
};
const tag = Date.now().toString(36).slice(-5);

const owner = await login('owner@stocktrack.local', 'Owner123!');
const me = await call('GET', '/auth/me', { token: owner });
const A = me.data.shops[0].id;
const nameA = me.data.shops[0].name;
let B = me.data.shops.find((s) => s.id !== A && s.isActive)?.id;
if (!B) {
  const r = await call('POST', '/shops', { token: owner, body: { name: 'Transfer Şube', copyFromShopId: A, copyCatalog: true } });
  B = r.data.id;
}
const nameB = (await call('GET', '/auth/me', { token: owner })).data.shops.find((s) => s.id === B).name;
console.log(`A=${nameA} B=${nameB}`);

console.log('1) A dükkânına stok');
const brand = `TrMarka${tag}`;
const intake = await call('POST', '/plates/batch', {
  token: owner,
  shop: A,
  body: {
    items: [
      {
        categoryName: 'Pleksi',
        brandName: brand,
        colorName: 'Kırmızı',
        colorCode: 'K-1',
        thicknessMm: 3,
        sheetWidthMm: 1220,
        sheetHeightMm: 2440,
        widthMm: 1220,
        heightMm: 2440,
        quantityInStock: 1,
      },
      { categoryName: `Vida${tag}`, measurementType: 'piece', name: `Vida ${tag}`, quantityInStock: 50 },
    ],
  },
});
ok(intake.status === 201 && intake.data.plateIds?.length === 2, `stok girişi: ${intake.status} ${JSON.stringify(intake.raw).slice(0, 160)}`);
const [sheetA, screwA] = intake.data.plateIds;

console.log('2) Hedef dükkânlar');
const targets = await call('GET', '/shop-transfers/targets', { token: owner, shop: A });
ok(targets.status === 200 && targets.data.some((t) => t.id === B && t.canSell), `hedefler: ${JSON.stringify(targets.data)}`);
ok(!targets.data.some((t) => t.id === A), 'kendi dükkânı hedefte yok');
const same = await call('POST', '/shop-transfers', { token: owner, shop: A, body: { toShopId: A, items: [{ plateId: screwA, quantity: 1, unitPrice: 1 }] } });
ok(same.status === 400, `aynı dükkâna satış reddi: ${same.status}`);

console.log('3) A → B satış (2 parça 1220×500 + 10 vida)');
const created = await call('POST', '/shop-transfers', {
  token: owner,
  shop: A,
  body: {
    toShopId: B,
    note: 'deneme',
    items: [
      { plateId: sheetA, quantity: 2, widthMm: 1220, heightMm: 500, unitPrice: 1000 },
      { plateId: screwA, quantity: 10, unitPrice: 5 },
    ],
  },
});
ok(created.status === 201, `belge: ${created.status} ${JSON.stringify(created.raw).slice(0, 300)}`);
const t1 = created.data;
ok(/^DA-\d{4}-\d{4}$/.test(t1.transferNo ?? ''), `belge no: ${t1.transferNo}`);
ok(Math.abs(t1.totalAmount - 1270) < 0.01, `toplam 2×0,61 m²×1000 + 10×5 = 1270: ${t1.totalAmount}`);
ok(t1.items.length === 3, `kalem: ${t1.items.length} (tabaka parçaları ayrı)`);
ok(t1.items.every((i) => i.state === 'in_stock'), 'hepsi stokta');
ok(t1.direction === 'out' && t1.canCancel === true, 'yön: out, geri alınabilir');

console.log('4) A tarafı: stok düştü, cari borçlandı, satışta işaret');
const sheetNow = await call('GET', `/plates?search=${brand}`, { token: owner, shop: A });
const s = sheetNow.data.items.find((p) => p.id === sheetA);
ok(s && Number(s.heightMm) === 1440, `kalan tabaka boyu 2440−1000 = 1440: ${s?.heightMm}`);
const screwNow = await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A });
ok(Number(screwNow.data.items.find((p) => p.id === screwA)?.quantityInStock) === 40, 'vida 50 → 40');
const custs = await call('GET', `/customers?search=${encodeURIComponent(nameB)}`, { token: owner, shop: A });
const linked = (custs.data.items ?? custs.data).find((c) => c.linkedShopId === B);
ok(linked && Number(linked.currentBalance) >= 1270, `B dükkânının carisi: ${linked?.name} bakiye ${linked?.currentBalance}`);
const salesA = await call('GET', '/sales?page=1&limit=10', { token: owner, shop: A });
const saleA = salesA.data.items.find((x) => x.id === t1.saleId);
ok(saleA?.shopTransfer?.transferNo === t1.transferNo && saleA.shopTransfer.toShopName === nameB, `satış işareti: ${JSON.stringify(saleA?.shopTransfer)}`);

console.log('5) B tarafı: yeni stok kalemleri, köken, alış maliyeti');
const platesB = await call('GET', `/plates?search=${brand}`, { token: owner, shop: B });
const piecesB = platesB.data.items.filter((p) => t1.items.some((i) => i.targetPlateId === p.id));
ok(piecesB.length === 2 && piecesB.every((p) => Number(p.widthMm) === 1220 && Number(p.heightMm) === 500), `B parçaları: ${piecesB.map((p) => `${p.widthMm}×${p.heightMm}`)}`);
ok(piecesB.every((p) => p.origin?.fromShopName === nameA && p.origin.transferNo === t1.transferNo), `köken: ${JSON.stringify(piecesB[0]?.origin)}`);
ok(piecesB.every((p) => p.template?.category?.name === 'Pleksi' && p.brand === brand), 'B kataloğunda aynı tür/marka');
const screwB = (await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: B })).data.items[0];
ok(screwB && Number(screwB.quantityInStock) === 10 && screwB.origin?.fromShopName === nameA, `B vida: ${screwB?.quantityInStock}`);
const costs = await call('GET', `/plates/costs?ids=${piecesB[0].id},${screwB.id}`, { token: owner, shop: B });
ok(Math.abs(costs.data[piecesB[0].id]?.unitCost - 1000) < 0.5, `parça maliyeti m² başına 1000: ${costs.data[piecesB[0].id]?.unitCost}`);
ok(costs.data[piecesB[0].id]?.supplierName === nameA, `alış tedarikçisi: ${costs.data[piecesB[0].id]?.supplierName}`);
ok(Math.abs(costs.data[screwB.id]?.unitCost - 5) < 0.01, `vida maliyeti 5: ${costs.data[screwB.id]?.unitCost}`);
const purchasesB = await call('GET', '/purchases?page=1&limit=5', { token: owner, shop: B });
const po = purchasesB.data.items.find((p) => p.id === t1.purchaseOrderId);
ok(po && Math.abs(Number(po.totalAmount) - 1270) < 0.01 && po.supplier?.name === nameA, `B alışı: ${po?.totalAmount} ${po?.supplier?.name}`);
const inB = await call('GET', '/shop-transfers?direction=in', { token: owner, shop: B });
ok(inB.data.items.some((x) => x.id === t1.id && x.direction === 'in' && !x.canCancel), 'B gelenlerde (geri alamaz)');

console.log('6) B parçayı ve vidayı müşteriye satıyor → A belgede görünür');
const cust = await call('POST', '/customers', { token: owner, shop: B, body: { name: `Son Alıcı ${tag}` } });
const sale = await call('POST', '/sales', {
  token: owner,
  shop: B,
  body: {
    buyerCustomerId: cust.data.id,
    items: [
      { plateId: piecesB[0].id, quantity: 1, unitPrice: 1500 },
      { plateId: screwB.id, quantity: 3, unitPrice: 8 },
    ],
  },
});
ok(sale.status === 201, `B satışı: ${sale.status} ${JSON.stringify(sale.raw).slice(0, 160)}`);
const outA = await call('GET', '/shop-transfers?direction=out', { token: owner, shop: A });
const v = outA.data.items.find((x) => x.id === t1.id);
const p0 = v.items.find((i) => i.targetPlateId === piecesB[0].id);
const p1 = v.items.find((i) => i.targetPlateId === piecesB[1].id);
const sc = v.items.find((i) => i.targetPlateId === screwB.id);
ok(p0.state === 'sold' && p0.usages[0]?.customerName === `Son Alıcı ${tag}`, `parça 1 satıldı: ${p0.state} → ${p0.usages[0]?.customerName}`);
ok(Math.abs(p0.usages[0]?.amount - 915) < 0.01, `satış tutarı 0,61 m²×1500 = 915: ${p0.usages[0]?.amount}`);
ok(p1.state === 'in_stock' && p1.usages.length === 0, `parça 2 stokta: ${p1.state}`);
ok(sc.state === 'partial' && Math.abs(sc.remainingRatio - 0.7) < 0.001 && sc.usages[0]?.quantity === 3, `vida kısmen: ${sc.state} kalan ${sc.remainingRatio}`);
ok(v.summary.sold === 1 && v.summary.partial === 1 && v.summary.inStock === 1, `özet: ${JSON.stringify(v.summary)}`);
ok(v.canCancel === false, 'kullanılan belge geri alınamaz');
const salesB = await call('GET', '/sales?page=1&limit=10', { token: owner, shop: B });
const saleB = salesB.data.items.find((x) => x.id === sale.data.sale?.id || x.id === sale.data.id);
ok(saleB?.items.every((i) => i.origin?.fromShopName === nameA), `B satış kalemlerinde köken: ${JSON.stringify(saleB?.items.map((i) => i.origin))}`);
const cancelUsed = await call('POST', `/shop-transfers/${t1.id}/cancel`, { token: owner, shop: A });
ok(cancelUsed.status === 400, `kullanılmış belge iptali reddi: ${cancelUsed.status} ${cancelUsed.data?.message ?? ''}`);
const detailB = await call('GET', `/shop-transfers/${t1.id}`, { token: owner, shop: B });
ok(detailB.status === 200 && detailB.data.direction === 'in', 'B ayrıntı görür');

console.log('7) Geri alma');
const balBefore = Number((await call('GET', `/customers/${linked.id}`, { token: owner, shop: A })).data.currentBalance);
const t2 = await call('POST', '/shop-transfers', { token: owner, shop: A, body: { toShopId: B, items: [{ plateId: screwA, quantity: 5, unitPrice: 6 }] } });
ok(t2.status === 201, `ikinci belge: ${t2.data.transferNo}`);
const n1 = Number(t1.transferNo.slice(-4));
ok(Number(t2.data.transferNo.slice(-4)) === n1 + 1, 'numara sıralı');
const cancel = await call('POST', `/shop-transfers/${t2.data.id}/cancel`, { token: owner, shop: A });
ok(cancel.status === 201 && cancel.data.status === 'cancelled', `iptal: ${cancel.status} ${cancel.data?.status ?? JSON.stringify(cancel.raw)}`);
ok(cancel.data.items.every((i) => i.state === 'cancelled'), 'kalemler iptal');
ok(Number((await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A })).data.items.find((p) => p.id === screwA)?.quantityInStock) === 40, 'A vida stoğu geri: 40');
const balAfter = Number((await call('GET', `/customers/${linked.id}`, { token: owner, shop: A })).data.currentBalance);
ok(Math.abs(balAfter - balBefore) < 0.01, `cari geri: ${balBefore} → ${balAfter}`);
const goneB = await call('GET', `/plates/${t2.data.items[0].targetPlateId}`, { token: owner, shop: B });
ok(goneB.status === 404, `B'deki kalem silindi: ${goneB.status}`);
const again = await call('POST', `/shop-transfers/${t2.data.id}/cancel`, { token: owner, shop: A });
ok(again.status === 400, 'iki kez iptal edilemez');
const fromB = await call('POST', `/shop-transfers/${t1.id}/cancel`, { token: owner, shop: B });
ok(fromB.status === 404, `alan dükkân iptal edemez: ${fromB.status}`);

console.log('7b) Alan dükkân aynı kaleme ayrı alış girdiyse geri alma reddi (hiçbir şey değişmez)');
const t3 = await call('POST', '/shop-transfers', { token: owner, shop: A, body: { toShopId: B, items: [{ plateId: screwA, quantity: 2, unitPrice: 6 }] } });
const supB = await call('POST', '/suppliers', { token: owner, shop: B, body: { name: `Ayrı Tedarikçi ${tag}` } });
const extra = await call('POST', '/purchases', { token: owner, shop: B, body: { supplierId: supB.data.id, items: [{ plateId: t3.data.items[0].targetPlateId, quantity: 1, unitPrice: 4 }] } });
ok(extra.status === 201, `B ayrı alış: ${extra.status}`);
const balT3 = Number((await call('GET', `/customers/${linked.id}`, { token: owner, shop: A })).data.currentBalance);
const cancelT3 = await call('POST', `/shop-transfers/${t3.data.id}/cancel`, { token: owner, shop: A });
ok(cancelT3.status === 400 && /ayrı bir alış/.test(cancelT3.data?.message ?? ''), `ret: ${cancelT3.status} ${cancelT3.data?.message}`);
ok(Number((await call('GET', `/plates?search=Vida ${tag}`, { token: owner, shop: A })).data.items.find((p) => p.id === screwA)?.quantityInStock) === 38, 'A vida stoğu değişmedi: 38');
ok(Math.abs(Number((await call('GET', `/customers/${linked.id}`, { token: owner, shop: A })).data.currentBalance) - balT3) < 0.01, 'cari değişmedi');
ok((await call('GET', `/shop-transfers/${t3.data.id}`, { token: owner, shop: A })).data.status === 'completed', 'belge tamam kaldı');

console.log('8) Yetki: yalnız A üyesi B\'ye satamaz, B kaydını göremez');
const email = `tr${tag}@stocktrack.local`;
const add = await call('POST', `/shops/${A}/members`, {
  token: owner,
  body: { newUser: { fullName: 'Transfer Çalışan', email, password: 'Calisan123!' }, permissions: perms({ sales: 'rw', stock: 'r', purchases: 'r' }) },
});
ok(add.status === 201, `üye: ${add.status}`);
const emp = await login(email, 'Calisan123!');
const tEmp = await call('GET', '/shop-transfers/targets', { token: emp, shop: A });
ok(tEmp.status === 200 && !tEmp.data.some((x) => x.id === B), `çalışan hedefleri: ${JSON.stringify(tEmp.data)}`);
const denied = await call('POST', '/shop-transfers', { token: emp, shop: A, body: { toShopId: B, items: [{ plateId: screwA, quantity: 1, unitPrice: 1 }] } });
ok(denied.status === 403, `B'ye satış reddi: ${denied.status} ${denied.data?.message ?? ''}`);
const listEmp = await call('GET', '/shop-transfers', { token: emp, shop: A });
const ve = listEmp.data.items?.find((x) => x.id === t1.id);
ok(listEmp.status === 200 && ve && ve.detailVisible === false, 'çalışan belgeyi görür, B müşterilerini görmez');
ok(ve?.items.find((i) => i.targetPlateId === piecesB[0].id)?.usages[0]?.customerName === null, 'müşteri adı gizli');
ok(ve?.items.find((i) => i.targetPlateId === piecesB[0].id)?.state === 'sold', 'durum yine de görünür (satıldı)');
const empB = await call('GET', '/shop-transfers', { token: emp, shop: B });
ok(empB.status === 403, `B dükkânına erişim yok: ${empB.status}`);

console.log(failures ? `\n${failures} HATA` : '\nTümü geçti');
process.exit(failures ? 1 : 0);
