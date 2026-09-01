import {
  fingerprintOf,
  parseAmount,
  parseCsv,
  parseDate,
  parseRow,
} from './statement-parser.util';

/**
 * Ekstre ayrıştırma bankaya özel DEĞİLDİR: kullanıcı sütunları eşler, sayı ve
 * tarih biçimleri burada normalleştirilir. Türk bankalarının yaygın biçimleri
 * (nokta binlik + virgül ondalık, GÜN.AY.YIL, ayrı borç/alacak sütunu) hedeftir.
 */
describe('parseAmount', () => {
  it('Türkçe biçimi çözer', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
  });

  it('İngilizce biçimi çözer', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
  });

  it('binlik ayracını ondalık sanmaz', () => {
    expect(parseAmount('1.234')).toBe(1234);
    expect(parseAmount('12.500')).toBe(12500);
  });

  it('para birimi simgesini ve boşluğu atar', () => {
    expect(parseAmount('  3.500,00 TL ')).toBe(3500);
    expect(parseAmount('₺1.000,50')).toBe(1000.5);
  });

  it('eksi ve parantezli (muhasebe) negatifi anlar', () => {
    expect(parseAmount('-750,25')).toBe(-750.25);
    expect(parseAmount('(500,00)')).toBe(-500);
  });

  it('boş ve anlamsız değerde null döner', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('—')).toBeNull();
  });

  it('sayı tipini olduğu gibi kabul eder', () => {
    expect(parseAmount(1234.56)).toBe(1234.56);
  });
});

describe('parseDate', () => {
  it('GÜN.AY.YIL biçimini çözer', () => {
    expect(parseDate('10.03.2026')).toBe('2026-03-10');
  });

  it('eğik çizgili ve iki haneli yılı çözer', () => {
    expect(parseDate('05/01/26')).toBe('2026-01-05');
  });

  it('ISO biçimini korur', () => {
    expect(parseDate('2026-03-10T08:00:00Z')).toBe('2026-03-10');
  });

  it('ay 12den büyükse gün/ay sırasını düzeltir', () => {
    // 2026-13-05 olamaz → 05.13 değil 13.05 okunmalı.
    expect(parseDate('13.05.2026')).toBe('2026-05-13');
  });

  it('Excel seri numarasını çözer', () => {
    // 45000 ≈ 2023-03-15
    expect(parseDate(45000)).toBe('2023-03-15');
  });

  it('çözülemeyende null döner', () => {
    expect(parseDate('tarih yok')).toBeNull();
  });
});

describe('parseRow', () => {
  const mapping = {
    date: 'Tarih',
    description: 'Açıklama',
    debit: 'Borç',
    credit: 'Alacak',
  };

  it('alacak sütununu POZİTİF (giriş) yazar', () => {
    const r = parseRow(
      { Tarih: '10.03.2026', Açıklama: 'FAST GELEN', Alacak: '3.500,00', Borç: '' },
      mapping,
    )!;
    expect(r.amount).toBe(3500);
    expect(r.transactionDate).toBe('2026-03-10');
  });

  it('borç sütununu NEGATİF (çıkış) yazar', () => {
    const r = parseRow(
      { Tarih: '10.03.2026', Açıklama: 'KİRA', Borç: '12.000,00', Alacak: '' },
      mapping,
    )!;
    expect(r.amount).toBe(-12000);
  });

  it('tek işaretli tutar sütununu kullanır', () => {
    const r = parseRow(
      { Tarih: '10.03.2026', Tutar: '-750,25', Açıklama: 'komisyon' },
      { date: 'Tarih', amount: 'Tutar', description: 'Açıklama' },
    )!;
    expect(r.amount).toBe(-750.25);
  });

  it('tarihi ya da tutarı olmayan satırı atar', () => {
    expect(parseRow({ Tarih: '', Alacak: '100' }, mapping)).toBeNull();
    expect(
      parseRow({ Tarih: '10.03.2026', Alacak: '0', Borç: '' }, mapping),
    ).toBeNull();
  });
});

describe('fingerprintOf', () => {
  const row = {
    transactionDate: '2026-03-10',
    amount: 3500,
    description: 'FAST GELEN AHMET',
  };

  it('banka referansı varsa onu kullanır', () => {
    expect(fingerprintOf({ ...row, externalId: 'DKN-42' })).toBe('ref:DKN-42');
  });

  it('referans yoksa içerikten türetir ve KARARLI kalır', () => {
    expect(fingerprintOf(row)).toBe(fingerprintOf({ ...row }));
  });

  it('boşluk/büyük-küçük farkını aynı sayar (mükerrer yükleme)', () => {
    expect(fingerprintOf(row)).toBe(
      fingerprintOf({ ...row, description: '  fast   gelen  ahmet ' }),
    );
  });

  it('tutar farklıysa ayrı hareket sayar', () => {
    expect(fingerprintOf(row)).not.toBe(fingerprintOf({ ...row, amount: 3501 }));
  });
});

describe('parseCsv', () => {
  it('noktalı virgüllü Türkçe Excel çıktısını okur', () => {
    const rows = parseCsv('Tarih;Açıklama;Tutar\n10.03.2026;FAST GELEN;3.500,00');
    expect(rows).toEqual([
      { Tarih: '10.03.2026', Açıklama: 'FAST GELEN', Tutar: '3.500,00' },
    ]);
  });

  it('virgüllü CSV ve tırnaklı alanları okur', () => {
    const rows = parseCsv('a,b\n"x, y",z');
    expect(rows[0]).toEqual({ a: 'x, y', b: 'z' });
  });

  it('BOM ve boş satırları temizler', () => {
    const rows = parseCsv('﻿Tarih;Tutar\n\n10.03.2026;100\n');
    expect(rows).toHaveLength(1);
  });

  it('boş metinde boş dizi döner', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
