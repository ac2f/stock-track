import { describe, expect, it } from 'vitest';
import { retainIn, stateOf, toggleManyIn, withoutIds } from './selection';

const r = (id: string) => ({ id });
const m = (...ids: string[]) => new Map(ids.map((id) => [id, r(id)]));

describe('seçim yardımcıları', () => {
  it('toggleMany: hepsi seçiliyse kaldırır, değilse eksikleri ekler', () => {
    const items = [r('a'), r('b'), r('c')];
    expect([...toggleManyIn(m(), items).keys()]).toEqual(['a', 'b', 'c']);
    expect([...toggleManyIn(m('a'), items).keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(toggleManyIn(m('a', 'b', 'c'), items).size).toBe(0);
  });

  it('toggleMany: seçili olup listede olmayanlara dokunmaz', () => {
    const out = toggleManyIn(m('x', 'a', 'b'), [r('a'), r('b')]);
    expect([...out.keys()]).toEqual(['x']);
  });

  it('boş listeyle toggleMany hiçbir şey yapmaz', () => {
    expect(toggleManyIn(m('a'), []).size).toBe(1);
  });

  it('stateOf: none / some / all', () => {
    const items = [r('a'), r('b')];
    expect(stateOf(m(), items)).toBe('none');
    expect(stateOf(m('a'), items)).toBe('some');
    expect(stateOf(m('a', 'b', 'z'), items)).toBe('all');
    expect(stateOf(m('a'), [])).toBe('none');
  });

  it('retain: listeden kalkanları düşürür, değişim yoksa aynı nesneyi döner', () => {
    const base = m('a', 'b');
    expect(retainIn(base, new Set(['a', 'b', 'c']))).toBe(base);
    expect([...retainIn(base, new Set(['b'])).keys()]).toEqual(['b']);
  });

  it('withoutIds: yalnız verilenleri çıkarır', () => {
    const base = m('a', 'b', 'c');
    expect(withoutIds(base, ['zzz'])).toBe(base);
    expect([...withoutIds(base, ['a', 'c']).keys()]).toEqual(['b']);
  });
});
