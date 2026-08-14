import { TelegramCommandsService } from './telegram-commands.service';

/**
 * Gruba /idx yazıldığında bot sohbet kimliğini cevaplar (mobilde kimliği
 * bulmak zor). Açılışta bekleyen eski mesajlar cevaplanmaz.
 */
describe('TelegramCommandsService — /idx komutu', () => {
  const TOKEN = 'BOT:123';
  let calls: { url: string; body?: Record<string, unknown> }[];

  /** getUpdates yanıtlarını sırayla döndüren sahte fetch. */
  function mockFetch(updateBatches: unknown[][]) {
    calls = [];
    const batches = [...updateBatches];
    global.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ url: String(url), body });
      if (String(url).includes('getUpdates')) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: batches.shift() ?? [] }),
        };
      }
      return { ok: true, json: async () => ({ ok: true, result: {} }) };
    }) as never;
  }

  function buildService() {
    return new TelegramCommandsService(
      { getTelegram: jest.fn(async () => ({ botToken: TOKEN })) } as never,
      { get: jest.fn(() => true) } as never,
    );
  }

  const message = (text: string, chatId = -1001234567890) => ({
    update_id: 10,
    message: {
      message_id: 5,
      text,
      chat: { id: chatId, type: 'supergroup', title: 'Yedek Grubu' },
    },
  });

  const sends = () => calls.filter((c) => c.url.includes('sendMessage'));

  it('ilk turda yalnızca imleci kurar, eski komutları cevaplamaz', async () => {
    mockFetch([[message('/idx')]]);
    const service = buildService();

    await service.poll();

    expect(sends()).toHaveLength(0);
    expect(calls[0].url).toContain('offset=-1');
  });

  it('/idx yazılınca sohbet kimliğini aynı sohbete cevaplar', async () => {
    // 1. tur: imleç kurulumu (boş), 2. tur: komut.
    mockFetch([[], [message('/idx')]]);
    const service = buildService();

    await service.poll();
    await service.poll();

    const sent = sends();
    expect(sent).toHaveLength(1);
    expect(sent[0].body?.chat_id).toBe(-1001234567890);
    expect(String(sent[0].body?.text)).toContain('-1001234567890');
    // Komuta cevap olarak bağlanır → grupta hangi isteğe yanıt olduğu belli.
    expect(sent[0].body?.reply_to_message_id).toBe(5);
  });

  it('/idx@BotAdi biçimini de tanır', async () => {
    mockFetch([[], [message('/idx@StockTrackBot')]]);
    const service = buildService();

    await service.poll();
    await service.poll();

    expect(sends()).toHaveLength(1);
  });

  it('ilgisiz mesajlara karışmaz', async () => {
    mockFetch([[], [message('merhaba /idx değil')]]);
    const service = buildService();

    await service.poll();
    await service.poll();

    expect(sends()).toHaveLength(0);
  });

  it('aynı komutu iki kez cevaplamaz (imleç ilerler)', async () => {
    mockFetch([[], [message('/idx')], []]);
    const service = buildService();

    await service.poll();
    await service.poll();
    await service.poll();

    expect(sends()).toHaveLength(1);
    // Üçüncü tur, işlenen mesajdan SONRASINI ister.
    expect(calls[calls.length - 1].url).toContain('offset=11');
  });
});
