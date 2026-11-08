import { describe, expect, it } from 'vitest';
import { visibleNav } from './nav';

const all = () => true;

describe('menü', () => {
  const items = (hasFeature: (f: 'corel' | 'network' | 'directory') => boolean, isOwner = false) =>
    visibleNav(all, false, 1, isOwner, hasFeature).flatMap((g) => g.items.map((i) => i.to));

  it('rehber özelliği kapalıysa Rehber menüde yok', () => {
    expect(items((f) => f !== 'directory')).not.toContain('/directory');
    expect(items(() => true)).toContain('/directory');
  });

  it('Ayarlar menüsünün arama sözcüklerinde Corel geçmez', () => {
    const settings = visibleNav(all, false, 1, false, () => false)
      .flatMap((g) => g.items)
      .find((i) => i.to === '/settings')!;
    expect(`${settings.label} ${settings.title} ${settings.keywords ?? ''}`.toLowerCase()).not.toContain('corel');
  });

  it('Platform yalnız sistem sahibine', () => {
    expect(items(() => true, false)).not.toContain('/platform');
    expect(items(() => true, true)).toContain('/platform');
  });
});
