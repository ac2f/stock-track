import { describe, expect, it } from 'vitest';
import type { ShopFeatureKey } from '../types';
import { visibleNav } from './nav';

const all = () => true;

describe('menü', () => {
  const items = (hasFeature: (f: ShopFeatureKey) => boolean, isOwner = false) =>
    visibleNav(all, false, 1, isOwner, hasFeature).flatMap((g) => g.items.map((i) => i.to));

  it('rehber özelliği kapalıysa Rehber menüde yok', () => {
    expect(items((f) => f !== 'directory')).not.toContain('/directory');
    expect(items(() => true)).toContain('/directory');
  });

  it('işletmeler arası satış yalnız ticaret özelliği açıksa; tek dükkânlı işletmede de görünür', () => {
    expect(items((f) => f !== 'trade')).not.toContain('/shop-transfers');
    expect(items(() => true)).toContain('/shop-transfers');
  });

  it('işletmeler arası satış satış/satın alma/stok/ayar alanlarından birini görene açık', () => {
    const only = (m: string) =>
      visibleNav((x) => x === m, false, 1, false, () => true).flatMap((g) => g.items.map((i) => i.to));
    for (const m of ['sales', 'purchases', 'stock', 'settings']) expect(only(m)).toContain('/shop-transfers');
    expect(only('quotes')).not.toContain('/shop-transfers');
  });

  it('ürün türleri ve malzeme türleri tek "Katalog" öğesinde; katalog izni gerekir', () => {
    const all = items(() => true);
    expect(all).toContain('/catalog');
    expect(all).not.toContain('/material-templates');
    expect(all).not.toContain('/material-categories');
    const noCatalog = visibleNav((m) => m !== 'catalog', false, 1, false, () => true).flatMap((g) => g.items.map((i) => i.to));
    expect(noCatalog).not.toContain('/catalog');
  });

  it('Ayarlar menüsünün arama sözcüklerinde Corel geçmez', () => {
    const settings = visibleNav(all, false, 1, false, () => false)
      .flatMap((g) => g.items)
      .find((i) => i.to === '/settings')!;
    expect(`${settings.label} ${settings.title} ${settings.keywords ?? ''}`.toLowerCase()).not.toContain('corel');
  });

  it('Platform yalnız sistem sahibine', () => {
    expect(items(() => true, false)).not.toContain('/platform');
    expect(items(() => true, true)).toContain('/platform');
  });
});
