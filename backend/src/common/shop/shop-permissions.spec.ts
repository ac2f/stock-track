import {
  excessPermissions,
  isSubset,
  legacyEmployeePermissions,
  noPermissions,
  normalizePermissions,
} from './shop-permissions';

describe('dükkân izinleri', () => {
  it('bilinmeyen alanları atar, eksikleri kapalı sayar', () => {
    const p = normalizePermissions({ quotes: { read: true, write: 'evet' }, hack: { read: true } });
    expect(p.quotes).toEqual({ read: true, write: false });
    expect(p.reports).toEqual({ read: false, write: false });
    expect((p as unknown as Record<string, unknown>).hack).toBeUndefined();
  });

  it('yönetici yalnız kendinde olanı verebilir', () => {
    const admin = noPermissions();
    admin.quotes = { read: true, write: true };
    admin.customers = { read: true, write: false };

    const ok = noPermissions();
    ok.quotes = { read: true, write: false };
    ok.customers = { read: true, write: false };
    expect(isSubset(ok, admin)).toBe(true);

    const tooMuch = noPermissions();
    tooMuch.customers = { read: true, write: true };
    tooMuch.reports = { read: true, write: false };
    expect(isSubset(tooMuch, admin)).toBe(false);
    expect(excessPermissions(tooMuch, admin)).toEqual(['Müşteriler (yazma)', 'Raporlar (okuma)']);
  });

  it('eski çalışan rapor, gider, ayar görmez', () => {
    const p = legacyEmployeePermissions();
    expect(p.quotes).toEqual({ read: true, write: true });
    expect(p.reports.read || p.expenses.read || p.settings.read || p.banking.read).toBe(false);
  });
});
