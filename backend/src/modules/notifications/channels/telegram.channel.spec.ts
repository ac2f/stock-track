import { ShopContext } from '../../../common/shop/shop-context';
import { NotificationTopic } from '../enums/notification-topic';
import { TelegramChannel } from './telegram.channel';

const SHOP = '00000000-0000-4000-8000-000000000001';

/**
 * Konu yönlendirmesi: dükkân konuyu başka sohbete gönderebilir ya da
 * kapatabilir; birden çok dükkân varsa mesajın başında dükkân adı olur.
 * Müşterinin kendi sohbetine giden mesaj yönlendirmeden etkilenmez.
 */
describe('TelegramChannel — konu yönlendirmesi', () => {
  const sent: { chat_id: string; text: string }[] = [];
  const realFetch = global.fetch;

  beforeEach(() => {
    sent.length = 0;
    global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
      sent.push(JSON.parse(init?.body ?? '{}'));
      return { ok: true, text: async () => '' } as Response;
    }) as never;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  function channel(shops: number) {
    const settings = {
      getBotToken: jest.fn(async () => 'B:x'),
      telegramTarget: jest.fn(async (topic: string | null) =>
        topic === 'stock' ? { chatId: '', off: true } : { chatId: topic === 'corel' ? '-200' : '-100', off: false },
      ),
      activeShopCount: jest.fn(async () => shops),
      currentShopName: jest.fn(async () => 'Merkez_1'),
    };
    return new TelegramChannel(settings as never);
  }

  it('konunun sohbetine gider, iki dükkân varsa dükkân adıyla başlar', async () => {
    await ShopContext.forShop(SHOP, () =>
      channel(2).send({ subject: 'Klasör', body: 'açıldı', topic: NotificationTopic.COREL }),
    );
    expect(sent).toEqual([
      expect.objectContaining({ chat_id: '-200', text: '🏪 Merkez\\_1\n*Klasör*\naçıldı' }),
    ]);
  });

  it('tek dükkânda ad eklenmez; kapalı konu gönderilmez ve kabul edilmez', async () => {
    const ch = channel(1);
    await ShopContext.forShop(SHOP, async () => {
      await ch.send({ body: 'satış', topic: NotificationTopic.SALES });
      expect(await ch.accepts({ body: 'x', topic: NotificationTopic.STOCK })).toBe(false);
      expect((await ch.send({ body: 'x', topic: NotificationTopic.STOCK })).success).toBe(false);
    });
    expect(sent).toEqual([expect.objectContaining({ chat_id: '-100', text: 'satış' })]);
  });

  it('müşterinin sohbetine giden mesaj yönlendirmeden ve kapalı konudan etkilenmez', async () => {
    const ch = channel(2);
    await ShopContext.forShop(SHOP, async () => {
      expect(await ch.accepts({ body: 'x', telegramChatId: '42', topic: NotificationTopic.STOCK })).toBe(true);
      await ch.send({ body: 'ödemeniz alındı', telegramChatId: '42', topic: NotificationTopic.PAYMENTS });
    });
    expect(sent).toEqual([expect.objectContaining({ chat_id: '42', text: 'ödemeniz alındı' })]);
  });
});
