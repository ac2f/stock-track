import { TelegramBotService } from './telegram-bot.service';

/**
 * Güvenlik kapısı: hiçbir komut, gönderen yetkili kullanıcı listesinde
 * doğrulanmadan işlenmez. Yalnızca /idx istisnadır — kimlik söyler, hiçbir
 * iş verisine dokunmaz (aksi halde kimse listeye eklenemezdi).
 */
describe('TelegramBotService — yetki doğrulaması', () => {
  const ALLOWED = 111;
  const STRANGER = 999;

  function buildBot(allowedIds: string[]) {
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
    const screens = {
      home: screen('home'),
      help: screen('help'),
      cariPrompt: screen('cari'),
      customerCard: screen('customerCard'),
      customerResults: screen('customerResults'),
      topDebtors: screen('topDebtors'),
      paymentSave: screen('paymentSave'),
    };

    const sessions = {
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

    const bot = new TelegramBotService(
      api as never,
      screens as never,
      sessions as never,
      settings as never,
      { get: jest.fn(() => true) } as never,
    );
    return { bot, api, sent, screensCalled, settings };
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
});
