import {
  asciiFold,
  COREL_PROTOCOL_HEADER,
  customerFolderName,
  customerLine,
  materialHaystack,
  materialLine,
  matchesTokens,
  nameToken,
  plateKind,
  searchTokens,
  thicknessMicrons,
  tsvBody,
} from './corel-naming.util';

/**
 * Corel eklentisinin klasör/dosya adı parçaları. Ad bir kez yanlış üretilirse
 * aynı malzeme iki ayrı klasöre düşer ve istiflenmez — bu yüzden kurallar
 * burada sabitlenir.
 */
describe('Corel isimlendirme', () => {
  it('Türkçe harfleri ASCII karşılığına katlar', () => {
    expect(asciiFold('Şişli Çağrı Öztürk İğdır ılık Ünal')).toBe(
      'Sisli Cagri Ozturk Igdir ilik Unal',
    );
    expect(asciiFold('Crème brûlée')).toBe('Creme brulee');
    expect(asciiFold(null)).toBe('');
  });

  it('müşteri klasörü: firma adı varsa o, yoksa kişi adı', () => {
    expect(customerFolderName('Ali Veli', 'Öztürk Reklam')).toBe(
      'Ozturk Reklam',
    );
    expect(customerFolderName('Ali Veli', '')).toBe('Ali Veli');
    expect(customerFolderName('Ali Veli', '   ')).toBe('Ali Veli');
    expect(customerFolderName('Ali Veli', null)).toBe('Ali Veli');
  });

  it('müşteri klasörü Windows için güvenli', () => {
    expect(customerFolderName('x', 'Acar Ltd. Şti.')).toBe('Acar Ltd. Sti');
    expect(customerFolderName('x', 'A/B: "Tabela" <1>')).toBe('A B Tabela 1');
    expect(customerFolderName('con')).toBe('con_');
    expect(customerFolderName('', '')).toBe('Musteri');
    expect(customerFolderName('a'.repeat(80)).length).toBeLessThanOrEqual(60);
  });

  it('jeton: küçük harf, ASCII, içinde "--" olamaz', () => {
    expect(nameToken('Akpolimer')).toBe('akpolimer');
    expect(nameToken('Dökme')).toBe('dokme');
    expect(nameToken('Açık  Mavi / RAL 5012')).toBe('acik-mavi-ral-5012');
    expect(nameToken('Alüminyum Kompozit')).toBe('aluminyum-kompozit');
    expect(nameToken('-- x --')).toBe('x');
    expect(nameToken(undefined)).toBe('');
  });

  it('kalınlık mikron olarak yazılır', () => {
    expect(thicknessMicrons(2.8)).toBe('2800');
    expect(thicknessMicrons('3.00')).toBe('3000');
    expect(thicknessMicrons(0.5)).toBe('500');
    expect(thicknessMicrons(null)).toBe('');
    expect(thicknessMicrons(0)).toBe('');
  });

  it('arama Türkçe harfe duyarsız, her kelime geçmeli', () => {
    const hay = materialHaystack({
      id: 'p1',
      name: 'Pleksi[AKP] 2.8x1220x2440',
      brand: 'Akpolimer',
      variant: 'Dökme',
      color: 'Beyaz',
      thicknessMm: '2.80',
      widthMm: '1220.00',
      heightMm: '2440.00',
      template: { name: 'Pleksi', category: { name: 'Pleksi' } },
    });
    expect(matchesTokens(hay, searchTokens('dokme BEYAZ'))).toBe(true);
    expect(matchesTokens(hay, searchTokens('pleksi 2,8'))).toBe(true);
    expect(matchesTokens(hay, searchTokens('2800um'))).toBe(true);
    expect(matchesTokens(hay, searchTokens('1220x2440'))).toBe(true);
    expect(matchesTokens(hay, searchTokens('siyah'))).toBe(false);
    expect(matchesTokens(hay, searchTokens(''))).toBe(true);
  });

  it('müşteri satırı: id, klasör, görünen ad', () => {
    expect(
      customerLine({
        id: 'c1',
        name: 'Ali Veli',
        companyName: 'Öztürk Reklam',
        phone: '0555',
      }),
    ).toBe('c1\tOzturk Reklam\tOzturk Reklam (Ali Veli) 0555');
    expect(customerLine({ id: 'c2', name: 'Şule\tTab' })).toBe(
      'c2\tSule Tab\tSule Tab',
    );
  });

  it('malzeme satırı eklentinin beklediği 11 alanı taşır', () => {
    const line = materialLine(
      {
        id: 'p1',
        name: 'Pleksi',
        brand: 'Akpolimer',
        variant: 'Dökme',
        color: 'Beyaz',
        thicknessMm: '2.80',
        widthMm: '1220.00',
        heightMm: '2440.00',
        template: { name: 'Pleksi 2.8', category: { name: 'Pleksi' } },
      },
      'C',
      3,
    );
    expect(line.split('\t')).toEqual([
      'p1',
      'C',
      'pleksi',
      '2800',
      'akpolimer',
      'dokme',
      'beyaz',
      '1220',
      '2440',
      '3',
      'Pleksi 2.8mm Akpolimer Dokme Beyaz 1220x2440 x3 [musterinin]',
    ]);
  });

  it('kategori yoksa tür şablon adından gelir', () => {
    expect(
      plateKind({ id: 'p', name: 'X', template: { name: 'Dekota' } }),
    ).toBe('dekota');
    expect(plateKind({ id: 'p', name: '' })).toBe('malzeme');
  });

  it('gövde sürüm başlığıyla başlar', () => {
    expect(tsvBody(['a\tb'])).toBe(`${COREL_PROTOCOL_HEADER}\na\tb\n`);
    expect(tsvBody([])).toBe(`${COREL_PROTOCOL_HEADER}\n`);
  });
});
