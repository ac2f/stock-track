import {
  allFeatures,
  defaultFeatures,
  isShopFeature,
  mergeFeatures,
  resolveFeatures,
  SHOP_FEATURES,
} from './shop-features';

describe('işletme özellikleri', () => {
  it('Corel varsayılan KAPALI; rehber, ağ ve işletmeler arası ticaret açık', () => {
    expect(defaultFeatures()).toEqual({ corel: false, network: true, directory: true, trade: true });
  });

  it('yazılmamış özellik varsayılanına düşer, bilinmeyen anahtar ve boolean olmayan değer atılır', () => {
    expect(resolveFeatures(undefined)).toEqual(defaultFeatures());
    expect(resolveFeatures(null)).toEqual(defaultFeatures());
    expect(resolveFeatures([])).toEqual(defaultFeatures());
    expect(resolveFeatures({ corel: true, hack: true, network: 'yes', directory: 0 })).toEqual({
      corel: true,
      network: true,
      directory: true,
      trade: true,
    });
    expect(resolveFeatures({ network: false })).toEqual({ corel: false, network: false, directory: true, trade: true });
  });

  it('sistem sahibi için hepsi açık', () => {
    expect(Object.values(allFeatures()).every(Boolean)).toBe(true);
    expect(Object.keys(allFeatures())).toEqual([...SHOP_FEATURES]);
  });

  it('yama yalnız bilinen anahtarları ve boolean değerleri uygular, diğerlerini korur', () => {
    expect(mergeFeatures({ corel: true }, { network: false })).toEqual({ corel: true, network: false });
    expect(mergeFeatures({ corel: true }, { corel: false, hack: true, directory: 'x' })).toEqual({ corel: false });
    expect(mergeFeatures(undefined, undefined)).toEqual({});
    expect(mergeFeatures({ corel: true, zzz: true }, null)).toEqual({ corel: true });
  });

  it('isShopFeature', () => {
    expect(isShopFeature('corel')).toBe(true);
    expect(isShopFeature('admin')).toBe(false);
    expect(isShopFeature(1)).toBe(false);
  });
});
