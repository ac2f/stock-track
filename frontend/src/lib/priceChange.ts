/**
 * Toplu perakende fiyat değişikliği. Üç biçim:
 *  - percent  mevcut fiyatı %p artırır (negatif: azaltır)
 *  - fixed    hepsine aynı fiyat
 *  - clear    kalemin kendi fiyatını kaldırır
 */
export type PriceMode = 'percent' | 'fixed' | 'clear';

export interface CurrentPrice {
  /** Kalemin kendi perakende fiyatı ('plate'); çatıdan gelen fiyat değildir. */
  retailPrice: number | null;
  priceSource: 'plate' | 'rule' | null;
  retailCurrency: string;
}

export type PriceAction =
  | { kind: 'set'; price: number; currency?: string }
  | { kind: 'clear' }
  | { kind: 'skip'; reason: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Girilen sayı: "1.250,50" / "1250.5" / "-10" → sayı; geçersizse null. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function planPriceChange(
  mode: PriceMode,
  value: number | null,
  current: CurrentPrice | undefined,
  currency?: string,
): PriceAction {
  if (mode === 'clear') return { kind: 'clear' };
  if (value == null) return { kind: 'skip', reason: 'Değer girilmedi.' };
  if (mode === 'fixed') {
    if (value < 0) return { kind: 'skip', reason: 'Fiyat negatif olamaz.' };
    return { kind: 'set', price: round2(value), currency };
  }
  // percent
  if (value <= -100) return { kind: 'skip', reason: '%-100 ve altı geçersiz.' };
  if (!current || current.priceSource !== 'plate' || current.retailPrice == null) {
    return { kind: 'skip', reason: 'Kendi perakende fiyatı yok.' };
  }
  const next = round2(Number(current.retailPrice) * (1 + value / 100));
  // Çok küçük fiyatlarda yuvarlama değişimi yutabilir: sessizce aynı kalmasın.
  if (next === round2(Number(current.retailPrice)) && value !== 0) {
    return { kind: 'skip', reason: 'Değişim yuvarlamada kayboldu.' };
  }
  return { kind: 'set', price: next, currency: current.retailCurrency };
}
