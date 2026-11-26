import { StripNulPipe, stripNul } from './strip-nul.pipe';

describe('StripNulPipe', () => {
  it('iç içe gövdedeki her metinden (anahtarlar dahil) NUL atılır, gerisi aynı kalır', () => {
    const body = { host: 'p\u0000c', files: ['a\u0000.nc', 'b'], sheets: [{ label: '\u0000x', w: 12 }], n: null, 'k\u0000': 1 };
    expect(stripNul(body)).toEqual({ host: 'pc', files: ['a.nc', 'b'], sheets: [{ label: 'x', w: 12 }], n: null, k: 1 });
  });
  it('gövde, sorgu ve parametrede çalışır; özel parametreye dokunmaz', () => {
    const pipe = new StripNulPipe();
    expect(pipe.transform('a\u0000b', { type: 'query' })).toBe('ab');
    expect(pipe.transform('a\u0000b', { type: 'custom' })).toBe('a\u0000b');
  });
});
