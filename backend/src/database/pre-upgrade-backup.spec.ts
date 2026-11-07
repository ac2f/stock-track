import { backupMode, upgradePending } from './pre-upgrade-backup';

describe('yükseltme öncesi yedek kararı', () => {
  it('veri varsa ve şema işareti eksikse yükseltme bekliyordur', () => {
    expect(upgradePending({ hasData: true, missing: ['platform şeması'] })).toBe(true);
  });

  it('şema güncelse (işaret tamam) yedek alınmaz', () => {
    expect(upgradePending({ hasData: true, missing: [] })).toBe(false);
  });

  it('boş veritabanında (ilk kurulum) yedek alınmaz', () => {
    expect(upgradePending({ hasData: false, missing: ['platform şeması'] })).toBe(false);
    expect(upgradePending({ hasData: false, missing: [] })).toBe(false);
  });

  it('PRE_UPGRADE_BACKUP: tanınmayan değer auto sayılır; off ve required korunur', () => {
    expect(backupMode(undefined)).toBe('auto');
    expect(backupMode('')).toBe('auto');
    expect(backupMode('AUTO')).toBe('auto');
    expect(backupMode('evet')).toBe('auto');
    expect(backupMode('off')).toBe('off');
    expect(backupMode(' Required ')).toBe('required');
  });
});
