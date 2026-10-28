import { describe, expect, it } from 'vitest';
import { editDistance, fold, matchesSearch, rankBySearch, scoreSearch, suggestQuery } from './search';

const T = 'Akpolimer[Beyaz 1001] 2.80x1220.00x2440.00 Pleksi Dökme';

describe('fold', () => {
  it('Türkçe karakterleri ve büyük/küçük harfi sadeleştirir', () => {
    expect(fold('İŞÇİ ĞÜÖ ıi')).toBe('isci guo ii');
    expect(fold('Alüminyum')).toBe('aluminyum');
  });
  it('ondalıkları sadeleştirir', () => {
    expect(fold('2,80 x 1220.00')).toBe('2.8 x 1220');
  });
});

describe('editDistance', () => {
  it('ekleme, silme, değiştirme ve yer değiştirmeyi sayar', () => {
    expect(editDistance('beyaz', 'bayaz')).toBe(1);
    expect(editDistance('pleksi', 'plekis')).toBe(1);
    expect(editDistance('abc', 'abcd')).toBe(1);
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3);
  });
});

describe('matchesSearch', () => {
  it('sözcük sırası fark etmez', () => {
    expect(matchesSearch('Alüminyum Kompozit 3mm', 'kompozit alüminyum')).toBe(true);
    expect(matchesSearch(T, 'pleksi beyaz akpolimer')).toBe(true);
  });
  it('büyük/küçük harf ve Türkçe karakter fark etmez', () => {
    expect(matchesSearch('Alüminyum Kompozit', 'ALUMINYUM')).toBe(true);
    expect(matchesSearch('Şeffaf Pleksi', 'seffaf')).toBe(true);
    expect(matchesSearch('Çelik', 'CELIK')).toBe(true);
    expect(matchesSearch('Işık', 'isik')).toBe(true);
  });
  it('ondalık ve ebat yazımı fark etmez', () => {
    expect(matchesSearch(T, '2,8')).toBe(true);
    expect(matchesSearch(T, '2.80')).toBe(true);
    expect(matchesSearch(T, '1220x2440')).toBe(true);
    expect(matchesSearch(T, '2440 1220')).toBe(true);
    expect(matchesSearch(T, '2,8mm')).toBe(true);
  });
  it('yazım hatasını tolere eder', () => {
    expect(matchesSearch(T, 'bayaz')).toBe(true);
    expect(matchesSearch(T, 'akpolimr')).toBe(true);
    expect(matchesSearch(T, 'akpolimmer')).toBe(true);
    expect(matchesSearch(T, 'plekis')).toBe(true);
    expect(matchesSearch(T, 'plexi')).toBe(true);
    expect(matchesSearch('Venge Kaplama', 'wenge')).toBe(true);
    expect(matchesSearch('Dekota Foamex', 'dekotta')).toBe(true);
  });
  it('yarım yazılan sözcüğü ön ekle bulur', () => {
    expect(matchesSearch('Alüminyum Kompozit', 'komp')).toBe(true);
    expect(matchesSearch(T, 'akpol')).toBe(true);
  });
  it('alakasız sözcüğü eşleştirmez', () => {
    expect(matchesSearch(T, 'mdf')).toBe(false);
    expect(matchesSearch(T, 'siyah')).toBe(false);
    expect(matchesSearch('Pleksi', 'forex')).toBe(false);
  });
  it('sayılar sayı gibi eşleşir (3, 30 ve 3.5 ile karışmaz)', () => {
    expect(matchesSearch('Pleksi 3 mm', '3')).toBe(true);
    expect(matchesSearch('Pleksi 30 mm', '3')).toBe(false);
    expect(matchesSearch('Pleksi 3.5 mm', '3')).toBe(false);
    expect(matchesSearch('Pleksi 1220 x 2440', '122')).toBe(true);
  });
  it('aramadaki her sözcük gerekir', () => {
    expect(matchesSearch(T, 'beyaz siyah')).toBe(false);
  });
  it('boş arama her şeyi eşleştirir', () => {
    expect(matchesSearch(T, '')).toBe(true);
    expect(matchesSearch(T, '  mm ')).toBe(true);
  });
});

describe('scoreSearch / rankBySearch', () => {
  it('tam eşleşme yazım hatalı eşleşmeden yüksek puan alır', () => {
    expect(scoreSearch('Pleksi', 'pleksi')).toBeGreaterThan(scoreSearch('Pleksi', 'plekis'));
  });
  it('en iyi eşleşme üstte sıralanır ve alakasızlar elenir', () => {
    const items = ['Forex Beyaz 3mm', 'Pleksi Beyaz 3mm', 'Pleksi Siyah 3mm', 'Pleksi Beyaz 5mm'];
    const r = rankBySearch(items, 'beyaz pleksi 3', (s) => s);
    expect(r[0]).toBe('Pleksi Beyaz 3mm');
    expect(r).not.toContain('Forex Beyaz 3mm');
    expect(r).not.toContain('Pleksi Siyah 3mm');
    expect(r).not.toContain('Pleksi Beyaz 5mm');
  });
  it('arama yoksa liste aynen kalır', () => {
    const items = ['b', 'a'];
    expect(rankBySearch(items, '', (s) => s)).toEqual(['b', 'a']);
  });
});

describe('suggestQuery', () => {
  const vocab = ['Akpolimer Beyaz', 'Pleksi Şeffaf', 'Alüminyum Kompozit'];
  it('yazım hatalı aramayı düzeltilmiş hâliyle önerir', () => {
    expect(suggestQuery('akpoliemr beyaz', vocab)).toBe('akpolimer beyaz');
  });
  it('doğru yazılmış aramada öneri yok', () => {
    expect(suggestQuery('pleksi seffaf', vocab)).toBeNull();
  });
  it('hiç yakın sözcük yoksa öneri yok', () => {
    expect(suggestQuery('zzzzzzz', vocab)).toBeNull();
  });
});
