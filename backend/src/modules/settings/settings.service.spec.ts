import { AppSetting } from './entities/app-setting.entity';
import { SettingsService } from './settings.service';

/**
 * Telegram ayarlarının çözümü: arayüzden girilen değer .env'i ezer, boş
 * bırakılan alan .env'e düşer. Jeton arayüze ASLA açık dönmez.
 */
describe('SettingsService — Telegram ayarları', () => {
  const ENV = {
    business: { name: 'Acme', defaultCurrency: 'TRY' },
    notifications: {
      telegramBotToken: 'ENVBOT:envsecret9999',
      telegramOwnerChatId: '111',
    },
    backup: { telegramChatId: '222', telegramCron: '0 * * * *' },
  };

  function buildService(row: Partial<AppSetting> = {}) {
    const stored = {
      id: 's1',
      businessName: 'Acme',
      telegramBotToken: '',
      telegramChatId: '',
      backupTelegramChatId: '',
      ...row,
    } as AppSetting;

    const repo = {
      findOne: jest.fn(() => Promise.resolve(stored)),
      create: jest.fn((d: Partial<AppSetting>) => d as AppSetting),
      save: jest.fn((e: AppSetting) => Promise.resolve(e)),
    };
    const config = {
      get: jest.fn((key: string) => ENV[key as keyof typeof ENV]),
    };
    return {
      service: new SettingsService(repo as never, config as never),
      stored,
      repo,
    };
  }

  it('ayar boşsa .env değerlerine düşer', async () => {
    const { service } = buildService();

    await expect(service.getTelegram()).resolves.toEqual({
      botToken: 'ENVBOT:envsecret9999',
      chatId: '111',
      backupChatId: '222',
    });
  });

  it('arayüzden girilen değerler .env değerlerini ezer', async () => {
    const { service } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
      telegramChatId: '999',
      backupTelegramChatId: '888',
    });

    await expect(service.getTelegram()).resolves.toEqual({
      botToken: 'DBBOT:dbsecret1234',
      chatId: '999',
      backupChatId: '888',
    });
  });

  it('ayrı yedek sohbeti yoksa bildirim sohbetine düşer', async () => {
    const { service } = buildService({
      telegramChatId: '999',
      backupTelegramChatId: '',
    });
    // .env'de yedek sohbeti tanımlı → önce o kullanılır.
    await expect(
      service.getTelegram().then((t) => t.backupChatId),
    ).resolves.toBe('222');

    const bare = buildService({ telegramChatId: '999' });
    (bare.service as unknown as { envBackup: { telegramChatId: string } }).envBackup.telegramChatId =
      '';
    await expect(
      bare.service.getTelegram().then((t) => t.backupChatId),
    ).resolves.toBe('999');
  });

  it('durum sorgusunda jeton maskelenir, açık dönmez', async () => {
    const { service } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
      telegramChatId: '999',
    });

    const status = await service.getTelegramStatus();

    expect(status.tokenSet).toBe(true);
    expect(status.tokenSource).toBe('db');
    expect(status.chatIdSource).toBe('db');
    expect(status.configured).toBe(true);
    expect(status.tokenMasked).toBe('DBBOT:••••1234');
    expect(JSON.stringify(status)).not.toContain('dbsecret1234');
  });

  it('boş jeton gönderilirse temizlenir (.env değerine geri döner)', async () => {
    const { service, stored } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
    });

    const status = await service.updateTelegram({ telegramBotToken: '' });

    expect(stored.telegramBotToken).toBe('');
    expect(status.tokenSource).toBe('env');
  });

  it('alan gönderilmezse mevcut değer korunur', async () => {
    const { service, stored } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
      telegramChatId: '999',
    });

    await service.updateTelegram({ telegramChatId: '777' });

    expect(stored.telegramBotToken).toBe('DBBOT:dbsecret1234');
    expect(stored.telegramChatId).toBe('777');
  });
});
