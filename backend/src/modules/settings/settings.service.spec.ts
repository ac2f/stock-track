import { ShopContext } from '../../common/shop/shop-context';
import { AppSetting } from './entities/app-setting.entity';
import { SystemSetting } from './entities/system-setting.entity';
import {
  businessView,
  cleanRoutes,
  CutPricingSettings,
  cutPricingView,
  SettingsService,
} from './settings.service';

const SHOP = '00000000-0000-4000-8000-000000000001';
const OTHER_SHOP = '00000000-0000-4000-8000-000000000002';
/** Testler bir dükkânın içinden çalışır (istek bağlamı gibi). */
const inShop = <T>(fn: () => Promise<T>) => ShopContext.forShop(SHOP, fn);
const inOtherShop = <T>(fn: () => Promise<T>) => ShopContext.forShop(OTHER_SHOP, fn);

/**
 * Veritabanı sahtesi: servisin ham SQL'lerini içeriğine göre yanıtlar.
 *  - ilk dükkân (sistem sahibinin kendi işletmesi) → `homeShopId`
 *  - bağlamsız yedek görevinin ilk dükkân sohbeti → `firstChat`
 */
function fakeQuery(opts: {
  homeShopId?: string;
  firstChat?: string;
  shopName?: string;
  otherShops?: { shop_id: string; name: string; chat: string; routes: unknown }[];
}) {
  return jest.fn((sql: string) => {
    if (sql.includes('telegram_routes')) return Promise.resolve(opts.otherShops ?? []);
    if (sql.includes('telegram_chat_id')) {
      return Promise.resolve(opts.firstChat ? [{ telegram_chat_id: opts.firstChat }] : []);
    }
    if (sql.includes('FROM "shops" WHERE "id"')) return Promise.resolve([{ name: opts.shopName ?? 'Merkez Dükkân' }]);
    if (sql.includes('FROM "shops"') && sql.includes('LIMIT 1')) {
      return Promise.resolve(opts.homeShopId ? [{ id: opts.homeShopId }] : []);
    }
    return Promise.resolve([]);
  });
}

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
    row: { telegramChatId?: string; telegramBotToken?: string; backupTelegramChatId?: string; allowed?: string } = {},
    opts: { homeShopId?: string } = {},
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
      telegramAllowedUserIds: row.allowed ?? '',
    } as SystemSetting;

    const repo = {
      findOne: jest.fn(() => Promise.resolve(stored)),
      create: jest.fn((d: Partial<AppSetting>) => d as AppSetting),
      save: jest.fn((e: AppSetting) => Promise.resolve(e)),
      // Varsayılan: test dükkânı sistem sahibinin kendi (ilk) dükkânı.
      query: fakeQuery({ homeShopId: opts.homeShopId ?? SHOP, firstChat: '555' }),
    };
    const systemRepo = {
      findOne: jest.fn(() => Promise.resolve(system)),
      create: jest.fn((d: Partial<SystemSetting>) => d as SystemSetting),
      save: jest.fn((e: SystemSetting) => Promise.resolve(e)),
    };
    const config = {
      get: jest.fn((key: string) => ENV[key as keyof typeof ENV]),
    };
    const service = new SettingsService(repo as never, systemRepo as never, config as never);
    // Gerçek Telegram'a gidilmez.
    jest.spyOn(service, 'botUsername').mockResolvedValue('stocktrack_bot');
    const assertGroupChat = jest
      .spyOn(service as unknown as { assertGroupChat(id: string): Promise<void> }, 'assertGroupChat')
      .mockResolvedValue(undefined);
    return { service, stored, system, repo, assertGroupChat };
  }

  it('ayar boşsa sistem sahibinin kendi dükkânı .env değerlerine düşer', async () => {
    const { service } = buildService();

    await expect(inShop(() => service.getTelegram())).resolves.toEqual({
      botToken: 'ENVBOT:envsecret9999',
      chatId: '111',
      backupChatId: '222',
    });
  });

  it('başka bir işletmenin bildirimleri sistem sahibinin .env sohbetine DÜŞMEZ', async () => {
    const { service } = buildService({}, { homeShopId: OTHER_SHOP });

    const t = await inShop(() => service.getTelegram());
    expect(t.chatId).toBe('');
    expect(t.botToken).toBe('ENVBOT:envsecret9999');
    // Kendi sohbetini yazınca o kullanılır.
    const own = buildService({ telegramChatId: '-100123456' }, { homeShopId: OTHER_SHOP });
    await expect(inShop(() => own.service.getTelegram()).then((x) => x.chatId)).resolves.toBe('-100123456');
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

  it('sistem sahibi görünümünde jeton maskelenir, açık dönmez', async () => {
    const { service } = buildService({
      telegramBotToken: 'DBBOT:dbsecret1234',
      telegramChatId: '999',
    });

    const status = await inShop(() => service.getTelegramStatus(true));

    expect(status.ownerView).toBe(true);
    expect(status.tokenSet).toBe(true);
    expect(status.tokenSource).toBe('db');
    expect(status.chatIdSource).toBe('db');
    expect(status.configured).toBe(true);
    expect(status.tokenMasked).toBe('DBBOT:••••1234');
    expect(JSON.stringify(status)).not.toContain('dbsecret1234');
  });

  it('İŞLETME görünümünde jeton, yedek sohbeti, yetkili kullanıcılar ve .env değerleri hiç yoktur', async () => {
    const { service } = buildService(
      {
        telegramBotToken: 'DBBOT:dbsecret1234',
        telegramChatId: '-100777',
        backupTelegramChatId: '888',
        allowed: '12345,67890',
      },
      { homeShopId: OTHER_SHOP },
    );

    const status = await inShop(() => service.getTelegramStatus(false, { corel: false }));
    const json = JSON.stringify(status);

    expect(status.ownerView).toBe(false);
    expect(status).toMatchObject({ botReady: true, botUsername: 'stocktrack_bot', chatId: '-100777', configured: true });
    // Alanların kendisi bile yoktur.
    for (const key of [
      'tokenSet',
      'tokenMasked',
      'tokenSource',
      'chatIdSource',
      'backupChatId',
      'effectiveBackupChatId',
      'backupCron',
      'allowedUserIds',
      'chatSharedWith',
    ]) {
      expect(status).not.toHaveProperty(key);
    }
    // Değerler başka bir biçimde de sızmaz: jeton, bot kimliği, .env sohbetleri, yetkili kimlikler.
    for (const secret of ['dbsecret1234', 'DBBOT', 'ENVBOT', 'envsecret9999', '"111"', '"222"', '"888"', '12345', '67890']) {
      expect(json).not.toContain(secret);
    }
  });

  it('işletme, sistem sahibinin .env sohbetini kendi sohbeti diye görmez', async () => {
    const { service } = buildService({}, { homeShopId: OTHER_SHOP });
    const status = await inShop(() => service.getTelegramStatus(false, { corel: false }));
    expect(status.chatId).toBe('');
    expect(status.configured).toBe(false);
    expect(JSON.stringify(status)).not.toContain('111');
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

    await inShop(() => service.updateTelegram({ telegramChatId: '-1001234567890' }, false));

    expect(system.telegramBotToken).toBe('DBBOT:dbsecret1234');
    expect(stored.telegramChatId).toBe('-1001234567890');
  });

  it('bot jetonunu, yedek sohbetini ve yetkili kullanıcıları yalnız sistem sahibi değiştirir', async () => {
    const { service, system } = buildService({ telegramBotToken: 'DBBOT:dbsecret1234' });

    await expect(
      inShop(() => service.updateTelegram({ telegramBotToken: 'X:y' }, false)),
    ).rejects.toThrow('yalnız sistem sahibi');
    await expect(
      inShop(() => service.updateTelegram({ telegramAllowedUserIds: '1' }, false)),
    ).rejects.toThrow('yalnız sistem sahibi');
    await expect(
      inShop(() => service.updateTelegram({ backupTelegramChatId: '-1001234567890' }, false)),
    ).rejects.toThrow('yalnız sistem sahibi');
    expect(system.telegramBotToken).toBe('DBBOT:dbsecret1234');
    expect(system.telegramAllowedUserIds).toBe('');
  });

  it('işletme yeni sohbet kimliğini yazarken bot o sohbette mi diye doğrulanır', async () => {
    const { service, stored, assertGroupChat } = buildService({ telegramChatId: '-100111111' });

    await inShop(() => service.updateTelegram({ telegramChatId: '-100222222' }, false));
    expect(assertGroupChat).toHaveBeenCalledWith('-100222222');
    expect(stored.telegramChatId).toBe('-100222222');

    // Değişmeyen kimlik yeniden doğrulanmaz.
    assertGroupChat.mockClear();
    await inShop(() => service.updateTelegram({ telegramChatId: '-100222222' }, false));
    expect(assertGroupChat).not.toHaveBeenCalled();
  });

  it('doğrulama başarısızsa (bot grupta değil / kişisel sohbet) kayıt yapılmaz', async () => {
    const { service, stored, assertGroupChat } = buildService({ telegramChatId: '-100111111' });
    assertGroupChat.mockRejectedValueOnce(new Error('Bot bu sohbette değil'));

    await expect(
      inShop(() => service.updateTelegram({ telegramChatId: '-100999999' }, false)),
    ).rejects.toThrow('Bot bu sohbette değil');
    expect(stored.telegramChatId).toBe('-100111111');
  });

  it('geçersiz biçimli sohbet kimliği reddedilir; sistem sahibi doğrulamaya takılmaz', async () => {
    const { service, assertGroupChat } = buildService();

    await expect(inShop(() => service.updateTelegram({ telegramChatId: 'merhaba' }, false))).rejects.toThrow(
      'geçerli bir Telegram sohbet kimliği',
    );
    await expect(
      inShop(() => service.updateTelegram({ telegramRoutes: { sales: { chatId: 'x y' } } }, false)),
    ).rejects.toThrow('geçerli bir Telegram sohbet kimliği');

    await inShop(() => service.updateTelegram({ telegramChatId: '123456789' }, true));
    expect(assertGroupChat).not.toHaveBeenCalled();
  });

  it('Corel özelliği kapalı işletme Corel konusunun hedefini değiştiremez', async () => {
    const { service, stored } = buildService({});
    stored.telegramRoutes = { corel: { chatId: '-100555555' } };

    await inShop(() =>
      service.updateTelegram({ telegramRoutes: { corel: { off: true }, sales: { off: true } } }, false, { corel: false }),
    );
    expect(stored.telegramRoutes).toEqual({ corel: { chatId: '-100555555' }, sales: { off: true } });
  });

  it('dükkân bağlamı yoksa (yedek görevi) ilk dükkânın sohbetine düşer', async () => {
    const { service } = buildService({ telegramChatId: '999' });

    await expect(service.getTelegram().then((t) => t.chatId)).resolves.toBe('555');
  });

  it('yedek görevi, ilk dükkânın sohbeti yoksa başka işletmenin sohbetini aramaz', async () => {
    const { service, repo } = buildService();
    repo.query = fakeQuery({ homeShopId: SHOP, firstChat: '' });
    // .env sohbeti (sistem sahibinin) kullanılır; hiçbir işletmenin grubu değil.
    await expect(service.getTelegram().then((t) => t.chatId)).resolves.toBe('111');
    const sql = repo.query.mock.calls.map((c) => String(c[0])).find((q) => q.includes('telegram_chat_id')) ?? '';
    expect(sql).toContain('ORDER BY "created_at" ASC LIMIT 1');
    expect(sql).not.toMatch(/telegram_chat_id"\s*<>/);
  });
});

describe('SettingsService — Telegram konuları ve klasör oluşturucu', () => {
  const ENV = {
    business: { name: 'Acme', defaultCurrency: 'TRY' },
    notifications: { telegramBotToken: 'B:x', telegramOwnerChatId: '' },
    backup: { telegramChatId: '', telegramCron: '0 * * * *' },
  };

  function build(
    row: Partial<AppSetting>,
    shops: { shop_id: string; name: string; chat: string; routes: unknown }[] = [],
  ) {
    const stored = { id: 's1', businessName: 'Acme', telegramChatId: '-100', ...row } as AppSetting;
    const repo = {
      findOne: jest.fn(() => Promise.resolve(stored)),
      save: jest.fn((e: AppSetting) => Promise.resolve(e)),
      query: fakeQuery({ homeShopId: SHOP, otherShops: shops }),
    };
    const systemRepo = {
      findOne: jest.fn(() => Promise.resolve({ id: 'sys', telegramBotToken: '', backupTelegramChatId: '' })),
    };
    const config = { get: jest.fn((key: string) => ENV[key as keyof typeof ENV]) };
    const service = new SettingsService(repo as never, systemRepo as never, config as never);
    jest.spyOn(service, 'botUsername').mockResolvedValue(null);
    return { service, stored };
  }

  it('konu kendi sohbetine, kapalıysa hiçbir yere, yazılmamışsa bildirim sohbetine gider', async () => {
    const { service } = build({
      telegramRoutes: { corel: { chatId: '-200' }, stock: { off: true } },
    });
    await inShop(async () => {
      expect(await service.telegramTarget('corel' as never)).toEqual({ chatId: '-200', off: false });
      expect(await service.telegramTarget('stock' as never)).toEqual({ chatId: '', off: true });
      expect(await service.telegramTarget('sales' as never)).toEqual({ chatId: '-100', off: false });
    });
  });

  it('konu listesi bilinmeyenleri atar, boş sohbeti varsayılana döndürür', () => {
    expect(
      cleanRoutes({
        corel: { chatId: ' -200 ' },
        sales: { chatId: '' },
        stock: { off: true, chatId: '-1' },
        hack: { chatId: '-9' },
      } as never),
    ).toEqual({ corel: { chatId: '-200' }, stock: { off: true } });
  });

  it('aynı sohbeti kullanan diğer dükkânları YALNIZ sistem sahibi görür', async () => {
    const { service } = build({ telegramRoutes: { corel: { chatId: '-200' } } }, [
      { shop_id: OTHER_SHOP, name: 'Şube', chat: '-100', routes: {} },
      { shop_id: '00000000-0000-4000-8000-000000000003', name: 'Atölye', chat: '-300', routes: { corel: { chatId: '-200' } } },
    ]);
    const status = await inShop(() => service.getTelegramStatus(true));
    expect(status.chatSharedWith).toEqual(['Şube']);
    expect(status.routes.find((r) => r.topic === 'corel')).toMatchObject({
      mode: 'chat',
      effectiveChatId: '-200',
      sharedWith: ['Atölye'],
    });
    expect(status.routes.find((r) => r.topic === 'sales')).toMatchObject({ mode: 'default', sharedWith: ['Şube'] });

    // İşletme görünümünde başka işletmelerin adı hiçbir yerde geçmez.
    const tenant = await inShop(() => service.getTelegramStatus(false, { corel: true }));
    const json = JSON.stringify(tenant);
    expect(json).not.toContain('Şube');
    expect(json).not.toContain('Atölye');
    expect(tenant.routes.every((r) => r.sharedWith.length === 0)).toBe(true);
  });

  it('Corel özelliği kapalı işletmede "Corel ve klasörler" konusu listelenmez', async () => {
    const { service } = build({});
    const closed = await inShop(() => service.getTelegramStatus(false, { corel: false }));
    expect(closed.routes.map((r) => r.topic)).not.toContain('corel');
    const open = await inShop(() => service.getTelegramStatus(false, { corel: true }));
    expect(open.routes.map((r) => r.topic)).toContain('corel');
    const owner = await inShop(() => service.getTelegramStatus(true));
    expect(owner.routes.map((r) => r.topic)).toContain('corel');
  });

  it('klasör kodu: yazılan ya da dükkân adından, ASCII ve kısa', async () => {
    const { service } = build({});
    const auto = await inShop(() => service.getFolderSettings());
    expect(auto).toMatchObject({ code: 'merkez-dukkan', customCode: '', enabled: true, materialSaleFolders: true });
    const set = await inShop(() =>
      service.updateFolderSettings({ code: 'Öztürk Şube 2', enabled: false, dayRoot: ' D:\\Isler ' }),
    );
    expect(set).toMatchObject({ code: 'ozturk-sube-2', enabled: false, dayRoot: 'D:\\Isler' });
  });
});

describe('SettingsService — işletme bilgileri (portal adresi, logo yolu)', () => {
  function build(row: Partial<AppSetting> = {}) {
    const stored = {
      id: 's1',
      businessName: 'Acme',
      portalBaseUrl: 'https://portal.sistem.example/portal',
      businessLogoPath: '/srv/logo.png',
      corelApiKey: 'GIZLI-COREL-ANAHTARI',
      ...row,
    } as AppSetting;
    const repo = {
      findOne: jest.fn(() => Promise.resolve(stored)),
      save: jest.fn((e: AppSetting) => Promise.resolve(e)),
      query: fakeQuery({ homeShopId: SHOP }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'business'
          ? { name: 'Acme', defaultCurrency: 'TRY', portalBaseUrl: 'https://varsayilan.example/portal' }
          : { telegramBotToken: '', telegramOwnerChatId: '', telegramCron: '' },
      ),
    };
    return {
      service: new SettingsService(repo as never, { findOne: jest.fn() } as never, config as never),
      stored,
    };
  }

  it('işletme portal adresini ve logo yolunu değiştiremez', async () => {
    const { service, stored } = build();

    await expect(
      inShop(() => service.update({ portalBaseUrl: 'https://kotu.example/portal' }, false)),
    ).rejects.toThrow('yalnız sistem sahibi');
    await expect(inShop(() => service.update({ businessLogoPath: '/etc/passwd' }, false))).rejects.toThrow(
      'yalnız sistem sahibi',
    );
    expect(stored.portalBaseUrl).toBe('https://portal.sistem.example/portal');
    expect(stored.businessLogoPath).toBe('/srv/logo.png');
  });

  it('işletmeye boş gösterilen alanları geri gönderirse dokunulmaz, kalanı kaydolur', async () => {
    const { service, stored } = build();

    const result = await inShop(() =>
      service.update({ businessName: 'Yeni Ad', portalBaseUrl: '', businessLogoPath: '' }, false),
    );

    expect(stored.businessName).toBe('Yeni Ad');
    expect(stored.portalBaseUrl).toBe('https://portal.sistem.example/portal');
    expect(stored.businessLogoPath).toBe('/srv/logo.png');
    expect(result.name).toBe('Yeni Ad');
  });

  it('sistem sahibi portal adresini değiştirir; sondaki / atılır', async () => {
    const { service, stored } = build();
    await inShop(() => service.update({ portalBaseUrl: ' https://yeni.example/portal/ ' }, true));
    expect(stored.portalBaseUrl).toBe('https://yeni.example/portal');
  });

  it('güncelleme yanıtı ham ayar satırını (Corel anahtarı vb.) taşımaz', async () => {
    const { service } = build();
    const result = await inShop(() => service.update({ businessName: 'Acme 2' }, false));
    const json = JSON.stringify(result);
    expect(json).not.toContain('GIZLI-COREL-ANAHTARI');
    expect(result).not.toHaveProperty('corelApiKey');
    expect(result).not.toHaveProperty('telegramBotToken');
    expect(result.portalBaseUrl).toBe('');
    expect(result.logoPath).toBe('');
  });

  it('görünüm: işletmeye portal adresi ve logo yolu boş gider, sistem sahibine dolu', () => {
    const b = { name: 'A', address: '', phone: '', taxNo: '', logoPath: '/x.png', portalBaseUrl: 'https://p/portal', defaultCurrency: 'TRY' };
    expect(businessView(b, false)).toMatchObject({ portalBaseUrl: '', logoPath: '' });
    expect(businessView(b, true)).toMatchObject({ portalBaseUrl: 'https://p/portal', logoPath: '/x.png' });
  });
});

describe('Kesim/işleme fiyatlandırması görünümü', () => {
  const full: CutPricingSettings = {
    hourlyRate: 600,
    minMinutes: 15,
    areaRate: 120,
    meterRate: 40,
    pieceRate: 25,
    minArea: 0.5,
    feedMmS: 20,
    rapidMmS: 100,
    plungeSec: 1,
    passDepthMm: 3,
    currency: 'TRY',
  };

  it('Corel özelliği kapalı işletmeye makine hızı ve asgari alan gitmez; m, m², süre, adet ücretleri gider', () => {
    const view = cutPricingView(full, { corel: false });
    expect(view).toMatchObject({ hourlyRate: 600, minMinutes: 15, areaRate: 120, meterRate: 40, pieceRate: 25, currency: 'TRY' });
    for (const k of ['minArea', 'feedMmS', 'rapidMmS', 'plungeSec', 'passDepthMm']) {
      expect(view).not.toHaveProperty(k);
    }
  });

  it('Corel özelliği açık işletme hepsini görür', () => {
    expect(cutPricingView(full, { corel: true })).toEqual(full);
  });
});
