import { ShopContext } from '../../common/shop/shop-context';
import { AppSetting } from './entities/app-setting.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { SettingsService } from './settings.service';

const SHOP = '00000000-0000-4000-8000-000000000001';
/** Testler bir dükkânın içinden çalışır (istek bağlamı gibi). */
const inShop = <T>(fn: () => Promise<T>) => ShopContext.forShop(SHOP, fn);

/**
 * Telegram ayarlarının çözümü: arayüzden girilen değer .env'i ezer, boş
 * bırakılan alan .env'e düşer. Jeton arayüze ASLA açık dönmez. Bot jetonu,
 * yedek sohbeti ve yetkili kullanıcılar sistemin; bildirim sohbeti dükkânın.
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

  function buildService(
    row: { telegramChatId?: string; telegramBotToken?: string; backupTelegramChatId?: string } = {},
  ) {
    const stored = {
      id: 's1',
      businessName: 'Acme',
      telegramChatId: row.telegramChatId ?? '',
    } as AppSetting;
    const system = {
      id: 'sys',
      telegramBotToken: row.telegramBotToken ?? '',
      backupTelegramChatId: row.backupTelegramChatId ?? '',
      telegramAllowedUserIds: '',
    } as SystemSetting;

    const repo = {
      findOne: jest.fn(() => Promise.resolve(stored)),
      create: jest.fn((d: Partial<AppSetting>) => d as AppSetting),
      save: jest.fn((e: AppSetting) => Promise.resolve(e)),
      query: jest.fn(() => Promise.resolve([{ telegram_chat_id: '555' }])),
    };
    const systemRepo = {
      findOne: jest.fn(() => Promise.resolve(system)),
      create: jest.fn((d: Partial<SystemSetting>) => d as SystemSetting),
      save: jest.fn((e: SystemSetting) => Promise.resolve(e)),
    };
    const config = {
      get: jest.fn((key: string) => ENV[key as keyof typeof ENV]),
    };
    return {
      service: new SettingsService(repo as never, systemRepo as never, config as never),
      stored,
      system,
      repo,
    };
  }

  it('ayar boşsa .env değerlerine düşer', async () => {
    const { service } = buildService();

    await expect(inShop(() => service.getTelegram())).resolves.toEqual({
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

    await expect(inShop(() => service.getTelegram())).resolves.toEqual({
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
      inShop(() => service.getTelegram()).then((t) => t.backupChatId),
    ).resolves.toBe('222');

    const bare = buildService({ telegramChatId: '999' });
    (bare.service as unknown as { envBackup: { telegramChatId: string } }).envBackup.telegramChatId =
      '';
    await expect(
      inShop(() => bare.service.getTelegram()).then((t) => t.backupChatId),
    ).resolves.toBe('999');
  });

  it('durum sorgusunda jeton maskelenir, açık dönmez', async () => {
    const { service } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
      telegramChatId: '999',
    });

    const status = await inShop(() => service.getTelegramStatus());

    expect(status.tokenSet).toBe(true);
    expect(status.tokenSource).toBe('db');
    expect(status.chatIdSource).toBe('db');
    expect(status.configured).toBe(true);
    expect(status.tokenMasked).toBe('DBBOT:••••1234');
    expect(JSON.stringify(status)).not.toContain('dbsecret1234');
  });

  it('boş jeton gönderilirse temizlenir (.env değerine geri döner)', async () => {
    const { service, system } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
    });

    const status = await inShop(() => service.updateTelegram({ telegramBotToken: '' }, true));

    expect(system.telegramBotToken).toBe('');
    expect(status.tokenSource).toBe('env');
  });

  it('alan gönderilmezse mevcut değer korunur', async () => {
    const { service, stored, system } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
      telegramChatId: '999',
    });

    await inShop(() => service.updateTelegram({ telegramChatId: '777' }, false));

    expect(system.telegramBotToken).toBe('DBBOT:dbsecret1234');
    expect(stored.telegramChatId).toBe('777');
  });

  it('bot jetonunu ve yetkili kullanıcıları yalnız sistem sahibi değiştirir', async () => {
    const { service, system } = buildService({ telegramBotToken: 'DBBOT:dbsecret1234' });

    await expect(
      inShop(() => service.updateTelegram({ telegramBotToken: 'X:y' }, false)),
    ).rejects.toThrow('yalnız sistem sahibi');
    await expect(
      inShop(() => service.updateTelegram({ telegramAllowedUserIds: '1' }, false)),
    ).rejects.toThrow('yalnız sistem sahibi');
    expect(system.telegramBotToken).toBe('DBBOT:dbsecret1234');
  });

  it('dükkân bağlamı yoksa (yedek görevi) ilk dükkânın sohbetine düşer', async () => {
    const { service } = buildService({ telegramChatId: '999' });

    await expect(service.getTelegram().then((t) => t.chatId)).resolves.toBe('555');
  });
});
