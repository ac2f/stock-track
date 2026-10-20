import { parseIds } from './plates.controller';

describe('plates ?ids= ayrıştırma', () => {
  const A = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  it('geçersiz kimlikleri ve tekrarları atar', () => {
    expect(parseIds(` ${A}, x, ${B.toUpperCase()},${A},, 123 `, 100)).toEqual([A, B]);
  });

  it('en çok verilen sayıda kimlik döner', () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    ).join(',');
    expect(parseIds(many, 100)).toHaveLength(100);
  });

  it('boş girdide boş liste', () => {
    expect(parseIds(undefined, 100)).toEqual([]);
    expect(parseIds('', 100)).toEqual([]);
  });
});
