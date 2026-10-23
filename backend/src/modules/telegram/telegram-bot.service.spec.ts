import { TelegramBotService } from './telegram-bot.service';

/**
 * Güvenlik kapısı: hiçbir komut, gönderen yetkili kullanıcı listesinde
 * doğrulanmadan işlenmez. Yalnızca /idx istisnadır — kimlik söyler, hiçbir
 * iş verisine dokunmaz (aksi halde kimse listeye eklenemezdi).
 */
describe('TelegramBotService — yetki doğrulaması', () => {
  const ALLOWED = 111;
  const STRANGER = 999;

  const SHOP_A = '00000000-0000-4000-8000-000000000001';
  const SHOP_B = '00000000-0000-4000-8000-000000000002';

  function buildBot(
    allowedIds: string[],
    linked: Record<string, { role: string; shops: { id: string; name: string; permissions: unknown }[] }> = {},
  ) {
    const sent: { chatId: number; text: string }[] = [];
    const screensCalled: string[] = [];

    const api = {
      token: jest.fn(async () => 'BOT:1'),
      getUpdates: jest.fn(async () => []),
      sendMessage: jest.fn(async (chatId: number, text: string) => {
        sent.push({ chatId, text });
        return 1;
      }),
      editMessage: jest.fn(async () => undefined),
      answerCallback: jest.fn(async () => undefined),
    };

    // Her ekran çağrısı kaydedilir → yetkisiz kullanıcıda hiçbiri çalışmamalı.
    const screen = (name: string) => async () => {
      screensCalled.push(name);
      return { text: name, keyboard: [] };
    };
    const homeShops: unknown[] = [];
    const screens = {
      home: async (shops?: unknown) => {
        screensCalled.push('home');
        homeShops.push(shops);
        return { text: 'home', keyboard: [] };
      },
      paymentAmountPrompt: screen('paymentAmountPrompt'),
      stockMenu: screen('stockMenu'),
      help: screen('help'),
      cariPrompt: screen('cari'),
      customerCard: screen('customerCard'),
      customerResults: screen('customerResults'),
      topDebtors: screen('topDebtors'),
      paymentSave: screen('paymentSave'),
    };

    const sessions = {
      shopOf: jest.fn(() => undefined),
      setShop: jest.fn(),
      get: jest.fn(() => ({ data: {}, updatedAt: Date.now() })),
      patch: jest.fn(),
      reset: jest.fn(),
      clearAwaiting: jest.fn(),
      sweep: jest.fn(),
    };

    const settings = {
      getAllowedUserIds: jest.fn(async () => allowedIds),
      isUserAllowed: jest.fn(async (id: number | string) =>
        allowedIds.includes(String(id)),
      ),
    };

    const shopAccess = {
      activeShops: jest.fn(async () => [
        { id: SHOP_A, name: 'Ana' },
        { id: SHOP_B, name: 'Şube' },
      ]),
      listFor: jest.fn(async (actor: { id: string }) =>
        linked[actor.id].shops.map((x) => ({ ...x, isActive: true, isAdmin: false })),
      ),
    };
    const users = {
      findByTelegramId: jest.fn(async (tg: string) =>
        linked[tg] ? { id: tg, role: linked[tg].role } : null,
      ),
    };

    const bot = new TelegramBotService(
      api as never,
      screens as never,
      sessions as never,
      settings as never,
      shopAccess as never,
      { get: jest.fn(() => true) } as never,
      users as never,
    );
    return { bot, api, sent, screensCalled, settings, sessions, homeShops };
  }

  /** Özel bir olayı doğrudan işleyiciye verir (poll döngüsünü atlar). */
  const handle = (bot: TelegramBotService, update: unknown) =>
    (bot as unknown as { handle: (u: unknown) => Promise<void> }).handle(update);

  const message = (fromId: number, text: string) => ({
    update_id: 1,
    message: {
      message_id: 5,
      text,
      from: { id: fromId },
      chat: { id: -100, type: 'supergroup', title: 'Ofis' },
    },
  });

  const button = (fromId: number, data: string) => ({
    update_id: 2,
    callback_query: {
      id: 'cb1',
      data,
      from: { id: fromId },
      message: { message_id: 5, chat: { id: -100, type: 'supergroup' } },
    },
  });

  it('yetkisiz kullanıcının komutunu işlemez', async () => {
    const { bot, screensCalled, sent } = buildBot([String(ALLOWED)]);

    await handle(bot, message(STRANGER, '/menu'));

    expect(screensCalled).toEqual([]);
    expect(sent[0].text).toContain('Yetkiniz yok');
    // Kişi kendi kimliğini görür ki sahibi listeye ekleyebilsin.
    expect(sent[0].text).toContain(String(STRANGER));
  });

  it('yetkisiz kullanıcının DÜĞMESİNİ de işlemez', async () => {
    const { bot, api, screensCalled } = buildBot([String(ALLOWED)]);

    await handle(bot, button(STRANGER, 'rep:debt'));

    expect(screensCalled).toEqual([]);
    expect(api.answerCallback).toHaveBeenCalledWith('cb1', 'Yetkiniz yok.');
  });

  it('yetkili kullanıcının komutunu işler', async () => {
    const { bot, screensCalled } = buildBot([String(ALLOWED)]);

    await handle(bot, message(ALLOWED, '/menu'));

    expect(screensCalled).toEqual(['home']);
  });

  it('yetkili kullanıcının düğmesini işler', async () => {
    const { bot, screensCalled } = buildBot([String(ALLOWED)]);

    await handle(bot, button(ALLOWED, 'rep:debt'));

    expect(screensCalled).toEqual(['topDebtors']);
  });

  it('liste boşken hiç kimse yetkili değildir', async () => {
    const { bot, screensCalled, sent } = buildBot([]);

    await handle(bot, message(ALLOWED, '/menu'));

    expect(screensCalled).toEqual([]);
    expect(sent[0].text).toContain('Yetkili kullanıcı listesi boş');
  });

  it('/idx yetki istemez ama iş verisine de dokunmaz', async () => {
    const { bot, screensCalled, sent } = buildBot([]);

    await handle(bot, message(STRANGER, '/idx'));

    expect(screensCalled).toEqual([]);
    // Yalnızca kimlikler döner.
    expect(sent[0].text).toContain('-100');
    expect(sent[0].text).toContain(String(STRANGER));
    expect(sent[0].text).toContain('henüz yetkili değil');
  });

  it('yetkisiz kullanıcı için oturum durumu okunmaz (akış ilerlemez)', async () => {
    const { bot, screensCalled } = buildBot([String(ALLOWED)]);

    // Tutar girer gibi düz metin gönderir.
    await handle(bot, message(STRANGER, '1500'));

    expect(screensCalled).toEqual([]);
  });

  describe('hesabına Telegram kimliği yazılmış çalışan', () => {
    const WORKER = 222;
    const readOnly = {
      customers: { read: true, write: false },
      payments: { read: true, write: false },
      stock: { read: false, write: false },
      reports: { read: false, write: false },
    };

    it('yetkili listede olmasa da girer; yalnız üye olduğu dükkânı görür', async () => {
      const { bot, screensCalled, sessions, homeShops } = buildBot([], {
        [WORKER]: { role: 'employee', shops: [{ id: SHOP_B, name: 'Şube', permissions: readOnly }] },
      });
      await handle(bot, message(WORKER, '/menu'));
      expect(screensCalled).toEqual(['home']);
      expect(sessions.setShop).toHaveBeenCalledWith(-100, SHOP_B);
      // Ana menü dükkân satırını yalnız onun dükkânlarından kurar (tek → satır yok).
      expect(homeShops[0]).toEqual([{ id: SHOP_B, name: 'Şube', permissions: readOnly }]);
    });

    it('üye olmadığı dükkânı düğmeyle seçemez', async () => {
      const { bot, sessions } = buildBot([], {
        [WORKER]: { role: 'employee', shops: [{ id: SHOP_B, name: 'Şube', permissions: readOnly }] },
      });
      await handle(bot, button(WORKER, `shop:${SHOP_A}`));
      expect(sessions.setShop).not.toHaveBeenCalledWith(-100, SHOP_A);
      expect(sessions.setShop).toHaveBeenCalledWith(-100, SHOP_B);
    });

    it('izni olmayan işi yapamaz (tahsilat yazma, stok, yedek)', async () => {
      const { bot, screensCalled, api } = buildBot([], {
        [WORKER]: { role: 'employee', shops: [{ id: SHOP_B, name: 'Şube', permissions: readOnly }] },
      });
      await handle(bot, button(WORKER, 'pay:c1'));
      await handle(bot, button(WORKER, 'stk'));
      await handle(bot, button(WORKER, 'bkp'));
      expect(screensCalled).toEqual([]);
      const texts = (api.editMessage.mock.calls as unknown as unknown[][]).map((c) => String(c[2]));
      expect(texts.every((t) => t.includes('izniniz yok'))).toBe(true);
      expect(texts).toHaveLength(3);
    });

    it('izni olan işi yapar', async () => {
      const { bot, screensCalled } = buildBot([], {
        [WORKER]: {
          role: 'employee',
          shops: [{ id: SHOP_B, name: 'Şube', permissions: { ...readOnly, payments: { read: true, write: true } } }],
        },
      });
      await handle(bot, button(WORKER, 'pay:c1'));
      expect(screensCalled).toEqual(['paymentAmountPrompt']);
    });

    it('sistemin yetkili listesindeki kişi eskisi gibi bütün dükkânlara girer', async () => {
      const { bot, homeShops } = buildBot([String(ALLOWED)]);
      await handle(bot, message(ALLOWED, '/menu'));
      expect((homeShops[0] as unknown[]).length).toBe(2);
    });
  });
});
