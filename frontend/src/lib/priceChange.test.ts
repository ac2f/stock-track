import { describe, expect, it } from 'vitest';
import { parseAmount, planPriceChange } from './priceChange';

const own = (p: number, cur = 'TRY') => ({ retailPrice: p, priceSource: 'plate' as const, retailCurrency: cur });

describe('parseAmount', () => {
  it('Türkçe ve nokta biçimlerini okur', () => {
    expect(parseAmount('1.250,50')).toBe(1250.5);
    expect(parseAmount('1250.5')).toBe(1250.5);
    expect(parseAmount('-10')).toBe(-10);
    expect(parseAmount(' 12,5 ')).toBe(12.5);
  });
  it('boş/geçersiz → null', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('planPriceChange', () => {
  it('yüzde: kendi fiyatını artırır/azaltır, para birimini korur', () => {
    expect(planPriceChange('percent', 10, own(200, 'USD'))).toEqual({ kind: 'set', price: 220, currency: 'USD' });
    expect(planPriceChange('percent', -25, own(80))).toEqual({ kind: 'set', price: 60, currency: 'TRY' });
  });
  it('yüzde: kuruşa yuvarlar', () => {
    expect(planPriceChange('percent', 7, own(99.99))).toEqual({ kind: 'set', price: 106.99, currency: 'TRY' });
  });
  it('yüzde: kendi fiyatı olmayan (çatı/boş) atlanır', () => {
    const rule = { retailPrice: 50, priceSource: 'rule' as const, retailCurrency: 'TRY' };
    expect(planPriceChange('percent', 10, rule).kind).toBe('skip');
    expect(planPriceChange('percent', 10, { retailPrice: null, priceSource: null, retailCurrency: 'TRY' }).kind).toBe('skip');
    expect(planPriceChange('percent', 10, undefined).kind).toBe('skip');
  });
  it('yüzde: -%100 ve altı geçersiz; değer yoksa atlanır', () => {
    expect(planPriceChange('percent', -100, own(10)).kind).toBe('skip');
    expect(planPriceChange('percent', null, own(10)).kind).toBe('skip');
  });
  it('yüzde: yuvarlamada kaybolan değişim sessizce geçmez', () => {
    expect(planPriceChange('percent', 1, own(0.01)).kind).toBe('skip');
  });
  it('sabit: mevcut fiyata bakmaz, negatifi reddeder, para birimini taşır', () => {
    expect(planPriceChange('fixed', 123.456, undefined, 'EUR')).toEqual({ kind: 'set', price: 123.46, currency: 'EUR' });
    expect(planPriceChange('fixed', -1, undefined).kind).toBe('skip');
  });
  it('kaldır: değer gerekmez', () => {
    expect(planPriceChange('clear', null, undefined)).toEqual({ kind: 'clear' });
  });
});
