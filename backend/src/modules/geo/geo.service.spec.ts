import { GeoService } from './geo.service';

describe('GeoService', () => {
  const geo = new GeoService();

  it('81 il ve 973 ilçe', () => {
    expect(geo.listProvinces()).toHaveLength(81);
    const total = geo.listProvinces().reduce((n, p) => n + (geo.listDistricts(p.plate)?.length ?? 0), 0);
    expect(total).toBe(973);
  });

  it('plaka koduyla ve adla bulunur, yazım farkı (Türkçe karakter, büyük/küçük harf) önemsenmez', () => {
    expect(geo.listDistricts('34')).toContain('Kadıköy');
    expect(geo.listDistricts('istanbul')).toContain('Kadıköy');
    expect(geo.listDistricts('ISTANBUL')).toContain('Kadıköy');
    expect(geo.listDistricts('6')).toContain('Çankaya');
    expect(geo.listDistricts('Var olmayan')).toBeNull();
  });

  it('il ve ilçe doğru yazıma çözülür', () => {
    expect(geo.canonicalProvince('istanbul')).toBe('İstanbul');
    expect(geo.canonicalProvince('  izmir ')).toBe('İzmir');
    expect(geo.canonicalProvince('Gotham')).toBeNull();
    expect(geo.canonicalDistrict('İstanbul', 'kadikoy')).toBe('Kadıköy');
    expect(geo.canonicalDistrict('Ankara', 'Kadıköy')).toBeNull(); // ilçe başka ile ait
    expect(geo.canonicalDistrict('Gotham', 'x')).toBeNull();
  });

  it('ilçeler Türkçe alfabe sırasıyla', () => {
    const ds = geo.listDistricts('34')!;
    expect(ds).toEqual([...ds].sort((a, b) => a.localeCompare(b, 'tr')));
  });
});
