import { Injectable } from '@nestjs/common';
import { foldTr } from '../../common/utils/search.util';
import { TR_LOCATIONS } from './tr-locations.data';

export interface Province {
  plate: string;
  name: string;
  region: string;
}

/**
 * İl / ilçe bilgisi (81 il, 973 ilçe). İşletme adresi ve rehber süzgeci için:
 * serbest yazıma izin verilmez; hep listedeki yazımla saklanır ("Istanbul",
 * "İstanbul" ve "istanbul" aynı ile çözülür), böylece süzgeç ve sayımlar tutarlı olur.
 */
@Injectable()
export class GeoService {
  private readonly provinces: Province[] = TR_LOCATIONS.map(([plate, name, region]) => ({ plate, name, region }));
  private readonly byFold = new Map<string, number>();
  private readonly districtFold: Map<string, string>[] = [];

  constructor() {
    TR_LOCATIONS.forEach(([, name, , districts], i) => {
      this.byFold.set(foldTr(name), i);
      const map = new Map<string, string>();
      for (const d of districts) map.set(foldTr(d), d);
      this.districtFold.push(map);
    });
  }

  listProvinces(): Province[] {
    return this.provinces;
  }

  /** Plaka koduna ("34") ya da ada ("İstanbul") göre ilçeler (Türkçe alfabe sırasıyla). */
  listDistricts(provinceKey: string): string[] | null {
    const i = this.indexOf(provinceKey);
    if (i < 0) return null;
    return [...TR_LOCATIONS[i][3]].sort((a, b) => a.localeCompare(b, 'tr'));
  }

  /** Listedeki doğru yazımı döner; tanınmıyorsa null. */
  canonicalProvince(input: string | null | undefined): string | null {
    if (!input?.trim()) return null;
    const i = this.indexOf(input);
    return i < 0 ? null : TR_LOCATIONS[i][1];
  }

  /** İlçe, verilen ile ait olmalıdır. */
  canonicalDistrict(province: string, input: string | null | undefined): string | null {
    if (!input?.trim()) return null;
    const i = this.indexOf(province);
    if (i < 0) return null;
    return this.districtFold[i].get(foldTr(input.trim())) ?? null;
  }

  private indexOf(key: string): number {
    const k = key.trim();
    const byPlate = this.provinces.findIndex((p) => p.plate === k || p.plate === k.padStart(2, '0'));
    if (/^\d{1,2}$/.test(k) && byPlate >= 0) return byPlate;
    return this.byFold.get(foldTr(k)) ?? -1;
  }
}
