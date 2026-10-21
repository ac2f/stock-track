import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { itemState, splitAmount } from './shop-transfers.service';

describe('Dükkânlar arası satış yardımcıları', () => {
  describe('splitAmount', () => {
    it('tutarı parçalara böler, kuruş farkını son parçaya yazar', () => {
      expect(splitAmount(100, 3)).toEqual([33.33, 33.33, 33.34]);
      expect(splitAmount(1220, 2)).toEqual([610, 610]);
    });

    it('parçaların toplamı her zaman satış tutarına eşittir', () => {
      for (const [total, n] of [
        [0.05, 3],
        [999.99, 7],
        [12345.67, 11],
      ] as const) {
        const parts = splitAmount(total, n);
        expect(parts).toHaveLength(n);
        expect(Math.round(parts.reduce((s, p) => s + p, 0) * 100) / 100).toBe(total);
      }
    });

    it('geçersiz adet tek parça sayılır', () => {
      expect(splitAmount(50, 0)).toEqual([50]);
    });
  });

  describe('itemState', () => {
    const sheet = {
      measurementType: MeasurementType.AREA,
      quantity: 1,
      widthMm: 1220,
      heightMm: 500,
      targetPlateId: 'p1',
    };
    const plate = (w: number, h: number, qty = 1, deleted = false) => ({
      id: 'p1',
      measurement_type: MeasurementType.AREA,
      width_mm: String(w),
      height_mm: String(h),
      quantity_in_stock: String(qty),
      deleted_at: deleted ? new Date() : null,
    });

    it('dokunulmamış parça stoktadır', () => {
      expect(itemState(sheet, plate(1220, 500), 0, false)).toEqual({ state: 'in_stock', remainingRatio: 1 });
    });

    it('kesilip bir kısmı satılan parça kısmen satılmıştır (kalan alan oranı)', () => {
      expect(itemState(sheet, plate(1220, 200), 1, false)).toEqual({ state: 'partial', remainingRatio: 0.4 });
    });

    it('tükenen (silinen) parça satış varsa satıldı, yoksa stoktan çıktı', () => {
      expect(itemState(sheet, plate(1220, 0, 0, true), 1, false).state).toBe('sold');
      expect(itemState(sheet, plate(1220, 500, 1, true), 0, false).state).toBe('removed');
    });

    it('adet malzemede kalan miktar oranı kullanılır; negatif stok sıfır sayılır', () => {
      const screws = { ...sheet, measurementType: MeasurementType.PIECE, quantity: 10, widthMm: null, heightMm: null };
      const row = { ...plate(0, 0), measurement_type: MeasurementType.PIECE, quantity_in_stock: '7' };
      expect(itemState(screws, row, 1, false)).toEqual({ state: 'partial', remainingRatio: 0.7 });
      expect(itemState(screws, { ...row, quantity_in_stock: '-2' }, 2, false).state).toBe('sold');
    });

    it('kullanım kaydı varsa ölçü değişmese de stokta sayılmaz', () => {
      expect(itemState(sheet, plate(1220, 500), 1, false).state).toBe('partial');
    });

    it('iptal edilen belgenin kalemleri iptaldir', () => {
      expect(itemState(sheet, plate(1220, 500), 0, true).state).toBe('cancelled');
      expect(itemState({ ...sheet, targetPlateId: null }, undefined, 0, false).state).toBe('cancelled');
    });
  });
});
