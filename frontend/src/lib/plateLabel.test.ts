import { describe, expect, it } from 'vitest';
import { displayPlateName, prettyAutoName } from './plateLabel';

describe('prettyAutoName', () => {
  it('sunucunun ürettiği adı tür · marka · renk · kalınlık olarak yazar', () => {
    expect(prettyAutoName('Alüminyum Kompozit Alucobond[Antrasit] 4.00×1500.00×4050.00', 'Alüminyum Kompozit')).toBe(
      'Alüminyum Kompozit · Alucobond · Antrasit · 4 mm',
    );
    expect(prettyAutoName('Pleksi Akpolimer[Döküm Beyaz] 2.80x1220x2440', 'Pleksi')).toBe('Pleksi · Akpolimer · Döküm Beyaz · 2.8 mm');
  });

  it('tür adıyla aynı markayı bir kez yazar, türü bilinmeyen adı olduğu gibi parçalar', () => {
    expect(prettyAutoName('Dekota Dekota[Beyaz] 3.00×1120.00×3050.00', 'Dekota')).toBe('Dekota · Beyaz · 3 mm');
    expect(prettyAutoName('Assan[Natürel] 2×1000×2000')).toBe('Assan · Natürel · 2 mm');
  });

  it('elle verilmiş adı değiştirmez', () => {
    expect(prettyAutoName('Müşterinin kendi plakası')).toBeNull();
    expect(
      displayPlateName({ name: 'Vitrin camı (özel)', measurementType: 'area', widthMm: 1000, heightMm: 500, thicknessMm: 4 }),
    ).toBe('Vitrin camı (özel)');
  });
});
