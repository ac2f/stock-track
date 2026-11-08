import { describe, expect, it } from 'vitest';
import { SECTIONS, visibleSections } from './sections';
import { defaultFeatures, resolveFeatures } from '../../lib/shop';
import type { ShopFeatureKey } from '../../types';

const has = (on: ShopFeatureKey[]) => (f: ShopFeatureKey) => on.includes(f);

describe('Ayarlar bölümleri', () => {
  it('Corel kapalı işletme Corel bölümünü hiç görmez (ne bölüm ne arama sözcüğü)', () => {
    const ids = visibleSections(false, has([])).map((s) => s.id);
    expect(ids).not.toContain('corel');
    const text = JSON.stringify(visibleSections(false, has([]))).toLowerCase();
    for (const word of ['corel', 'runner', 'renamer', 'ac2f']) expect(text).not.toContain(word);
  });

  it('Corel açık işletme ve sistem sahibi Corel bölümünü görür', () => {
    expect(visibleSections(false, has(['corel'])).map((s) => s.id)).toContain('corel');
    expect(visibleSections(true, () => true).map((s) => s.id)).toContain('corel');
  });

  it('yedek/bakım/yerel sunucu yalnız sistem sahibine', () => {
    const tenant = visibleSections(false, has(['corel'])).map((s) => s.id);
    for (const id of ['yedek', 'bakim', 'yerel-sunucu'] as const) expect(tenant).not.toContain(id);
    const owner = visibleSections(true, has([])).map((s) => s.id);
    for (const id of ['yedek', 'bakim', 'yerel-sunucu'] as const) expect(owner).toContain(id);
  });

  it('fiyatlandırma TEK bölüm: eski satış/kesim fiyat bölümleri yok, m·m²·süre·adet anahtar sözcükleri var', () => {
    const ids = SECTIONS.map((s) => s.id as string);
    expect(ids).toContain('fiyatlandirma');
    expect(ids).not.toContain('satis-fiyat');
    expect(ids).not.toContain('kesim-fiyat');
    const pricing = SECTIONS.find((s) => s.id === 'fiyatlandirma')!;
    for (const w of ['metre', 'm2', 'süre', 'adet']) expect(pricing.keywords).toContain(w);
  });

  it('Telegram bölümü işletmeye jeton/yetkili kullanıcı vaat etmez', () => {
    const t = SECTIONS.find((s) => s.id === 'telegram')!;
    const text = `${t.title} ${t.description} ${t.keywords}`.toLowerCase();
    expect(text).not.toContain('jeton');
    expect(text).not.toContain('token');
    expect(text).not.toContain('yetkili');
  });
});

describe('İşletme özellikleri', () => {
  it('Corel varsayılan kapalı; rehber ve ağ açık', () => {
    expect(defaultFeatures()).toEqual({ corel: false, network: true, directory: true });
  });

  it('eski oturum bilgisinde özellik yoksa varsayılanlar geçer; yazılan değer ezer', () => {
    expect(resolveFeatures(undefined)).toEqual(defaultFeatures());
    expect(resolveFeatures({ corel: true, directory: false })).toEqual({ corel: true, network: true, directory: false });
  });
});
