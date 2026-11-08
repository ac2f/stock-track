import { MaterialPlate } from './entities/material-plate.entity';
import { customPlateName, derivePlateName } from './plate-name.util';

const tpl = {
  defaultSizeId: 'size-1',
  defaultSize: { widthMm: '1220.00', heightMm: '2440.00' },
  category: { name: 'Pleksi' },
};

describe('plaka adı (türetilir, saklanmaz)', () => {
  it('ön yüzdeki eski önerinin AYNISI: tür + marka[renk kod] + kalınlık x ebat', () => {
    expect(
      derivePlateName({ brand: 'Akpolimer', color: 'Kırmızı', colorCode: 'K-1', thicknessMm: '3.00', sizeId: 'size-1', template: tpl }),
    ).toBe('Pleksi Akpolimer[Kırmızı K-1] 3.00x1220.00x2440.00');
  });

  it('eksik alanlar "—" olur; kalemin hiç ebadı yoksa "x—x—"', () => {
    expect(derivePlateName({ sizeId: null, template: { category: { name: 'MDF' } } })).toBe('MDF —[—] —x—x—');
    expect(derivePlateName({ brand: 'X', color: 'Beyaz', thicknessMm: '2.00', sizeId: null })).toBe('X[Beyaz] 2.00x—x—');
  });

  it('düz sayı iki ondalığa tamamlanır (veritabanı biçimiyle aynı)', () => {
    expect(derivePlateName({ brand: 'A', thicknessMm: 3, sizeId: null })).toBe('A[—] 3.00x—x—');
  });

  it('ebat şablonunkinden farklıysa ya da şablon yüklü değilse YANLIŞ değer yazılmaz (ebat atlanır)', () => {
    expect(derivePlateName({ brand: 'A', thicknessMm: '3.00', sizeId: 'baska', template: tpl })).toBe('Pleksi A[—] 3.00');
    expect(derivePlateName({ brand: 'A', thicknessMm: '3.00', sizeId: 'size-1' })).toBe('A[—] 3.00');
  });

  it('açık ebat verilirse (oluştururken katalogdan) o kullanılır', () => {
    expect(
      derivePlateName({ brand: 'A', thicknessMm: '3.00', sizeId: 'z' }, { widthMm: '1000.00', heightMm: '500.00' }),
    ).toBe('A[—] 3.00x1000.00x500.00');
  });

  it('elle yazılmış ad: türetilmişle aynıysa (eski ön yüz/çevrimdışı kuyruk) SAKLANMAZ', () => {
    const d = 'Pleksi Akpolimer[Kırmızı K-1] 3.00x1220.00x2440.00';
    expect(customPlateName(d, d, 'Pleksi')).toBeNull();
    // sunucunun eski, tür önekisiz biçimi de türetilmiş sayılır
    expect(customPlateName('Akpolimer[Kırmızı K-1] 3.00x1220.00x2440.00', d, 'Pleksi')).toBeNull();
    expect(customPlateName('   ', d, 'Pleksi')).toBeNull();
    expect(customPlateName(undefined, d, 'Pleksi')).toBeNull();
  });

  it('gerçekten elle yazılmış ad aynen saklanır (kırpılır)', () => {
    const d = 'Pleksi Akpolimer[Kırmızı K-1] 3.00x1220.00x2440.00';
    expect(customPlateName('  Vitrin için ayrıldı ', d, 'Pleksi')).toBe('Vitrin için ayrıldı');
    expect(customPlateName('S Levha (kalan)', d, 'Pleksi')).toBe('S Levha (kalan)');
  });
});

describe('MaterialPlate.name (getter + toJSON)', () => {
  const make = (over: Partial<MaterialPlate>) =>
    Object.assign(new MaterialPlate(), { brand: 'Akpolimer', color: 'Şeffaf', thicknessMm: '3.00', sizeId: 'size-1', template: tpl }, over);

  it('ad saklı değilse türetilir; elle yazılmışsa o görünür', () => {
    expect(make({ customName: null }).name).toBe('Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00');
    expect(make({ customName: 'Özel ad' }).name).toBe('Özel ad');
    expect(make({ customName: '   ' }).name).toBe('Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00');
  });

  it('marka değişince ad kendiliğinden güncel kalır (saklı kopya eskimez)', () => {
    const p = make({ customName: null });
    p.brand = 'Yeni Marka';
    expect(p.name).toContain('Yeni Marka[');
  });

  it('API çıktısı: name var, ham sütun (customName) yok', () => {
    const json = JSON.parse(JSON.stringify(make({ customName: null })));
    expect(json.name).toBe('Pleksi Akpolimer[Şeffaf] 3.00x1220.00x2440.00');
    expect('customName' in json).toBe(false);
  });
});
