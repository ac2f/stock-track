import { describe, expect, it } from 'vitest';
import { readUrlState, writeUrlState } from './urlState';

interface F {
  search?: string;
  status?: string;
  inStock?: boolean;
  thicknessMm?: number;
  page: number;
  limit: number;
}
const defaults: F = { page: 1, limit: 25 };
const opts = { keys: ['search', 'status', 'inStock', 'thicknessMm', 'page'] as const, numbers: ['thicknessMm'] as const };

describe('urlState', () => {
  it('liste durumunu adresten okur: sayılar sayı, evet/hayır evet/hayır, metin metin', () => {
    const s = readUrlState(new URLSearchParams('search=2026&inStock=true&thicknessMm=2.8&page=3&other=x'), defaults, opts);
    expect(s).toEqual({ search: '2026', inStock: true, thicknessMm: 2.8, page: 3, limit: 25 });
  });

  it('bozuk sayıyı ve listede olmayan anahtarı almaz, varsayılan kalır', () => {
    const s = readUrlState(new URLSearchParams('page=abc&limit=999'), defaults, opts);
    expect(s).toEqual({ page: 1, limit: 25 });
  });

  it('varsayılanları ve boşları yazmaz, başka parametrelere dokunmaz', () => {
    const p = writeUrlState(new URLSearchParams('new=1&search=eski'), { page: 1, limit: 25, search: '', status: 'sent' }, defaults, opts);
    expect(p.toString()).toBe('new=1&status=sent');
  });

  it('önek ile aynı sayfadaki iki liste ayrılır', () => {
    const p = writeUrlState(new URLSearchParams('page=4'), { page: 2, limit: 25 }, defaults, { ...opts, prefix: 'h.' });
    expect(p.toString()).toBe('page=4&h.page=2');
    expect(readUrlState(p, defaults, { ...opts, prefix: 'h.' }).page).toBe(2);
  });
});
