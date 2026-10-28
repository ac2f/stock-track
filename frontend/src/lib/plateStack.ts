import type { Plate } from '../types';
import { materialKey } from './plateGrouping';

/**
 * İSTİFLEME: stokta birebir aynı olan fiziksel parçalar (aynı malzeme, aynı
 * kalan ebat, aynı sahip, aynı kaynak) tek bir "yığın" olarak gösterilir:
 * "Pleksi 3mm 1000×2000 ×5". Yığın açılınca parçalar tek tek görünür ve
 * düzenlenir. Farklı ebat/sahip/kaynak ya da biten (stokta olmayan) parça
 * yığına KATILMAZ — görünüm yalnız sadeleşir, veri değişmez.
 */
export interface PlateStack {
  key: string;
  /** Yığındaki parçalar (liste sırası korunur). */
  plates: Plate[];
  /** Temsilci parça (ad, ebat, sahip bilgisi için). */
  first: Plate;
  count: number;
  /** Toplam stok miktarı (adetli/rulolu malzemede parça başına miktar farklı olabilir). */
  totalQty: number;
  /** Stoğa giriş tarihleri aralığı (YYYY-MM-DD); tek tarih ya da yok olabilir. */
  addedFrom?: string;
  addedTo?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** Parçanın yığın kimliği: bu alanların hepsi aynıysa parçalar birebir aynıdır. */
export function stackKey(p: Plate): string {
  const owners = (p.owners?.length ? p.owners : ['İşletme'])
    .map((o) => o.trim().toLocaleLowerCase('tr'))
    .sort()
    .join('+');
  return [
    materialKey(p),
    p.measurementType,
    num(p.widthMm),
    num(p.heightMm),
    num(p.thicknessMm),
    p.brand ?? '',
    p.color ?? '',
    p.colorCode ?? '',
    p.variant ?? '',
    owners,
    p.origin?.transferNo ?? '',
    // Biten parça, stoktakilerle aynı yığında "5 adet" gibi yanlış görünmesin.
    num(p.quantityInStock) > 0 ? 'in' : 'out',
  ].join('|');
}

/** Parçaları yığınlara ayırır; ilk görülme sırası korunur. */
export function stackPlates(plates: readonly Plate[]): PlateStack[] {
  const map = new Map<string, PlateStack>();
  for (const plate of plates) {
    const key = stackKey(plate);
    let s = map.get(key);
    if (!s) {
      s = { key, plates: [], first: plate, count: 0, totalQty: 0 };
      map.set(key, s);
    }
    s.plates.push(plate);
    s.count++;
    s.totalQty += Number(plate.quantityInStock) || 0;
    const d = plate.addedAt?.slice(0, 10);
    if (d) {
      if (!s.addedFrom || d < s.addedFrom) s.addedFrom = d;
      if (!s.addedTo || d > s.addedTo) s.addedTo = d;
    }
  }
  return [...map.values()];
}
