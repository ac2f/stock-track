import { describe, expect, it } from 'vitest';
import { quoteLinePreview } from './quoteCalc';
import type { Plate, QuoteItemInput } from '../types';

/**
 * Teklif formundaki canlı tutar, sunucunun kayda yazdığı tutarın aynısı olmalı: sunucu ölçüyü (m², metre, saat)
 * 4 haneye yuvarlayıp birim fiyatla çarpar. Gerçek sunucuyla 750 rastgele kalemde karşılaştırıldı; yuvarlanmadan
 * çarpınca 200 kalemin 19'unda 1–3 kuruş fark çıkıyordu.
 */
const item = (x: Partial<QuoteItemInput>) => ({ lineKind: 'processing', quantity: 1, unitPrice: 0, ...x }) as QuoteItemInput;
const plate = (measurementType: string) => ({ id: 'p', measurementType, widthMm: 1220, heightMm: 2440 }) as unknown as Plate;

describe('teklif kalemi tutarı (sunucuyla aynı)', () => {
  it('süre: saat 4 haneye yuvarlanır (5 dk × 933/saat = 0,0833 saat → 77,72)', () => {
    expect(quoteLinePreview(item({ billingUnit: 'time', durationMinutes: 5, unitPrice: 933 }), plate('area')).lineTotal).toBe(77.72);
    expect(quoteLinePreview(item({ billingUnit: 'time', durationMinutes: 61, unitPrice: 500.56 }), plate('piece')).lineTotal).toBe(508.92);
  });
  it('alan: m² 4 haneye yuvarlanır (285 × 916 mm = 0,2611 m² × 359,38 → 93,83)', () => {
    expect(quoteLinePreview(item({ billingUnit: 'area', widthMm: 285, heightMm: 916, unitPrice: 359.38 }), plate('area')).lineTotal).toBe(93.83);
    expect(quoteLinePreview(item({ lineKind: 'sale', quantity: 7, billingUnit: 'area', widthMm: 914, heightMm: 457, unitPrice: 665.67 }), plate('length')).lineTotal).toBe(1946.35);
  });
  it('asgari süre uygulanır', () => {
    const p = quoteLinePreview(item({ billingUnit: 'time', durationMinutes: 5, unitPrice: 600 }), plate('area'), 15);
    expect(p.billedMinutes).toBe(15);
    expect(p.lineTotal).toBe(150);
  });
});
