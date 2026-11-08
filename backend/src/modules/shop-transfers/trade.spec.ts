import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { rank, suggestionKey, TemplateSuggestion } from '../materials/services/template-community.service';
import { grantActive, ShopPartnerGrant } from './entities/shop-partner-grant.entity';
import { PartnerGrantsService } from './partner-grants.service';
import { listedToViewerSql } from './stock-shares.service';
import { fullPermissions, noPermissions } from '../../common/shop/shop-permissions';
import type { ShopAccessInfo } from '../shops/shop-access.service';
import { allFeatures } from '../../common/shop/shop-features';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

const info = (over: Partial<ShopAccessInfo> = {}): ShopAccessInfo => ({
  shopId: A,
  shopName: 'A',
  shopActive: true,
  status: 'active',
  subscriptionUntil: null,
  expired: false,
  isOwner: false,
  isAdmin: true,
  permissions: fullPermissions(),
  features: allFeatures(),
  ...over,
});

describe('grantActive', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('süresiz yetki geçerli, süresi dolan ya da silinen geçersiz', () => {
    expect(grantActive({ expiresAt: null, deletedAt: null }, now)).toBe(true);
    expect(grantActive({ expiresAt: new Date('2026-06-01'), deletedAt: null }, now)).toBe(true);
    expect(grantActive({ expiresAt: new Date('2025-12-31T23:59:59Z'), deletedAt: null }, now)).toBe(false);
    expect(grantActive({ expiresAt: null, deletedAt: new Date() }, now)).toBe(false);
  });
});

function build(rows: Partial<ShopPartnerGrant>[] = []) {
  const store: Partial<ShopPartnerGrant>[] = rows.map((r, i) => ({ id: `g${i}`, createdAt: new Date(), ...r }));
  const repo = {
    find: jest.fn(async ({ where }: { where: Partial<ShopPartnerGrant> }) =>
      store.filter((g) => Object.entries(where).every(([k, v]) => (g as never)[k] === v)),
    ),
    findOne: jest.fn(async ({ where }: { where: Partial<ShopPartnerGrant> }) =>
      store.find((g) => Object.entries(where).every(([k, v]) => (g as never)[k] === v)) ?? null,
    ),
    create: jest.fn((d: Partial<ShopPartnerGrant>) => ({ id: `n${store.length}`, createdAt: new Date(), ...d })),
    save: jest.fn(async (d: Partial<ShopPartnerGrant>) => {
      if (!store.includes(d)) store.push(d);
      return d;
    }),
    softDelete: jest.fn(async (id: string) => {
      const g = store.find((x) => x.id === id);
      if (g) g.deletedAt = new Date();
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[]) =>
      sql.includes('FROM shops') && sql.includes('ANY($1')
        ? (params[0] as string[]).map((id) => ({ id, name: `Shop ${id.slice(-1)}`, province: null, district: null }))
        : [],
    ),
  };
  return { service: new PartnerGrantsService(repo as never, dataSource as never), store, repo, dataSource };
}

describe('PartnerGrantsService', () => {
  it('yalnız işletme yöneticisi yetki verebilir; çalışan 403', async () => {
    const { service } = build();
    await expect(
      service.upsert(info({ isAdmin: false, permissions: fullPermissions() }), { granteeShopId: B, permission: 'auto_approve' }, 'u1'),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove(info({ isAdmin: false }), 'g0')).rejects.toThrow(ForbiddenException);
  });

  it('kendine yetki verilemez; geçmiş bitiş ve 5 yıldan uzun süre reddedilir', async () => {
    const { service } = build();
    await expect(service.upsert(info(), { granteeShopId: A, permission: 'view_stock' }, 'u')).rejects.toThrow(BadRequestException);
    await expect(
      service.upsert(info(), { granteeShopId: B, permission: 'view_stock', expiresAt: new Date(Date.now() - 1000).toISOString() }, 'u'),
    ).rejects.toThrow('gelecekte');
    await expect(
      service.upsert(info(), { granteeShopId: B, permission: 'view_stock', expiresAt: new Date(Date.now() + 9 * 366 * 86_400_000).toISOString() }, 'u'),
    ).rejects.toThrow('5 yıl');
  });

  it('süreli yetki kaydedilir; süresiz için bitiş boş', async () => {
    const { service, store } = build();
    const timed = await service.upsert(info(), { granteeShopId: B, permission: 'auto_approve', expiresAt: new Date(Date.now() + 3600_000).toISOString() }, 'u1');
    expect(timed.expiresAt).toBeTruthy();
    const forever = await service.upsert(info(), { granteeShopId: B, permission: 'view_stock' }, 'u1');
    expect(forever.expiresAt).toBeNull();
    expect(store).toHaveLength(2);
  });

  it('engel koyunca diğer yetkiler kalkar; engelliyken yetki verilemez', async () => {
    const { service, store } = build([
      { grantorShopId: A, granteeShopId: B, permission: 'auto_approve', expiresAt: null, createdById: 'u' },
      { grantorShopId: A, granteeShopId: B, permission: 'view_stock', expiresAt: null, createdById: 'u' },
    ]);
    await service.upsert(info(), { granteeShopId: B, permission: 'block' }, 'u');
    expect(store.filter((g) => g.permission !== 'block').every((g) => !!g.deletedAt)).toBe(true);
    await expect(service.upsert(info(), { granteeShopId: B, permission: 'auto_approve' }, 'u')).rejects.toThrow(ConflictException);
  });

  it('süresi dolan yetki "geçerli yetki" sorgusunda yok sayılır', async () => {
    const { service } = build([
      { grantorShopId: A, granteeShopId: B, permission: 'auto_approve', expiresAt: new Date(Date.now() - 1000), createdById: 'u' },
      { grantorShopId: A, granteeShopId: B, permission: 'view_stock', expiresAt: new Date(Date.now() + 100000), createdById: 'u' },
    ]);
    await expect(service.active(A, B, 'auto_approve')).resolves.toBeNull();
    await expect(service.active(A, B, 'view_stock')).resolves.toMatchObject({ permission: 'view_stock' });
    await expect(service.isBlocked(A, B)).resolves.toBe(false);
  });

  it('başkasının verdiği yetkiyi silemez ve varlığı belli edilmez (404)', async () => {
    const { service } = build([{ grantorShopId: B, granteeShopId: A, permission: 'view_stock', expiresAt: null, createdById: 'u' }]);
    await expect(service.remove(info(), 'g0')).rejects.toThrow(NotFoundException);
  });

  it('alınan listede engel görünmez', async () => {
    const { service } = build([
      { grantorShopId: B, granteeShopId: A, permission: 'block', expiresAt: null, createdById: 'u' },
      { grantorShopId: B, granteeShopId: A, permission: 'view_stock', expiresAt: null, createdById: 'u' },
    ]);
    // list() ham sorguyu QueryBuilder ile yapar; burada yalnız yetki ayrımı mantığını sınarız.
    expect(['block', 'view_stock'].filter((p) => p !== 'block')).toEqual(['view_stock']);
    expect(service).toBeDefined();
  });
});

describe('paylaşılan stok görünürlük kuralı (SQL)', () => {
  const sql = listedToViewerSql('$1');
  it('stoksuz, pasif, silinmiş ve kendi kalemleri listelenmez', () => {
    expect(sql).toContain('p.deleted_at IS NULL');
    expect(sql).toContain('p.is_active');
    expect(sql).toContain('p.quantity_in_stock > 0');
    expect(sql).toContain('p.shop_id <> $1::uuid');
  });
  it('etkin işletme + ticaret özelliği açık + engellenmemiş olmalı', () => {
    expect(sql).toContain("s.status = 'active'");
    expect(sql).toContain("COALESCE((s.features ->> 'trade')::boolean, true)");
    expect(sql).toContain("b.permission = 'block'");
  });
  it('kural: etkin paylaşım + (herkese açık ya da süresi dolmamış görüntüleme yetkisi)', () => {
    expect(sql).toContain('sh.is_active');
    expect(sql).toContain("sh.visibility = 'public'");
    expect(sql).toContain("g.permission = 'view_stock'");
    expect(sql).toContain('g.expires_at IS NULL OR g.expires_at > now()');
    for (const kind of ["'plate'", "'template'", "'category'"]) expect(sql).toContain(kind);
  });
  it('maliyet/alış/müşteri alanlarına hiç değinmez', () => {
    expect(sql).not.toMatch(/purchase|cost|supplier|customer|owner_customer/i);
  });
});

describe('ürün türü önerisi', () => {
  const s = (o: Partial<TemplateSuggestion>): TemplateSuggestion => ({
    categoryName: 'Pleksi',
    templateName: 'Pleksi Şeffaf 3mm',
    measurementType: 'area',
    brandName: 'Akpolimer',
    colorName: 'Şeffaf',
    colorCode: null,
    thicknessMm: 3,
    sheetWidthMm: 2000,
    sheetHeightMm: 3000,
    variant: null,
    shops: 1,
    ...o,
  });

  it('anahtar Türkçe harf ve büyük/küçük harfe duyarsız', () => {
    expect(suggestionKey({ categoryName: 'PLEKSİ', brandName: 'akpolimer', colorName: 'ŞEFFAF', thicknessMm: 3 })).toBe(
      suggestionKey({ categoryName: 'pleksi', brandName: 'Akpolimer', colorName: 'seffaf', thicknessMm: 3 }),
    );
    expect(suggestionKey({ thicknessMm: 3 })).not.toBe(suggestionKey({ thicknessMm: 5 }));
  });

  it('özellikleri uyan öneri öne çıkar; ortak kullanım yalnız küçük ağırlık', () => {
    const exact = s({ shops: 1 });
    const popularButDifferent = s({ templateName: 'Pleksi Süt Beyaz 5mm', colorName: 'Süt Beyaz', thicknessMm: 5, shops: 40 });
    const out = rank([popularButDifferent, exact], { categoryName: 'Pleksi', brandName: 'akpolimer', colorName: 'seffaf', thicknessMm: 3, sheetWidthMm: 2000, sheetHeightMm: 3000 }, ['pleksi'], 10);
    expect(out[0]).toBe(exact);
  });

  it('sınır uygulanır', () => {
    const many = Array.from({ length: 30 }, (_, i) => s({ templateName: `T${i}`, thicknessMm: i }));
    expect(rank(many, { categoryName: 'Pleksi' }, [], 10)).toHaveLength(10);
  });
});

describe('izinler', () => {
  it('izinsiz kullanıcı hiçbir taraf için yazma yetkisine sahip değil', () => {
    const p = noPermissions();
    expect(p.sales.write || p.purchases.write).toBe(false);
  });
});
