import { NotFoundException } from '@nestjs/common';
import { CorelRunnerService } from './corel-runner.service';

/** Runner nabzı ve klasör raporu: "bağlı mı" ve "klasör açıldı mı" kararı. */
describe('CorelRunnerService', () => {
  function build(quotes: Record<string, unknown>[] = []) {
    const rows: Record<string, any>[] = [];
    const runnersRepo = {
      findOne: jest.fn(async ({ where: { host } }) => rows.find((r) => r.host === host) ?? null),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => {
        if (!x.id) {
          x.id = `r${rows.length + 1}`;
          rows.push(x);
        }
        return x;
      }),
      update: jest.fn(async (id, patch) => Object.assign(rows.find((r) => r.id === id)!, patch)),
      find: jest.fn(async () => rows),
      delete: jest.fn(),
    };
    const quotesRepo = {
      findOne: jest.fn(async ({ where: { id } }) => quotes.find((q) => q.id === id) ?? null),
      update: jest.fn(async (id, patch) => Object.assign(quotes.find((q) => q.id === id)!, patch)),
    };
    return { service: new CorelRunnerService(runnersRepo as never, quotesRepo as never), rows, quotes };
  }

  it('nabız bilgisayar başına tek satır tutar ve bağlı gösterir', async () => {
    const { service, rows } = build();
    await service.heartbeat({ host: 'DUKKAN-PC', version: '1.1.0', pollSeconds: 30, dayRoot: 'D:\\Isler' });
    await service.heartbeat({ host: 'DUKKAN-PC', pollSeconds: 30 });
    expect(rows).toHaveLength(1);
    const [view] = await service.list();
    expect(view.online).toBe(true);
    expect(view.dayRoot).toBe('D:\\Isler');
    expect(view.version).toBe('1.1.0');
  });

  it('nabız gecikince bağlantı yok sayılır (3 tur + 15 sn)', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const seen = (sec: number) => new Date(now.getTime() - sec * 1000);
    expect(CorelRunnerService.isOnline({ lastSeenAt: seen(100), pollSeconds: 30 }, now)).toBe(true);
    expect(CorelRunnerService.isOnline({ lastSeenAt: seen(110), pollSeconds: 30 }, now)).toBe(false);
  });

  it('aynı hata sürerken ilk görüldüğü anı korur, düzelince temizler', async () => {
    const { service, rows } = build();
    await service.heartbeat({ host: 'PC', error: 'Gün klasörü bilinmiyor' });
    const first = rows[0].lastErrorAt;
    await new Promise((r) => setTimeout(r, 5));
    await service.heartbeat({ host: 'PC', error: 'Gün klasörü bilinmiyor' });
    expect(rows[0].lastErrorAt).toBe(first);
    await service.heartbeat({ host: 'PC', error: null });
    expect(rows[0].lastError).toBeNull();
  });

  it('klasör raporu teklife ve runnera yazılır', async () => {
    const quote = { id: 'q1', quoteNo: 'TKF-2026-0007' };
    const { service, rows } = build([quote]);
    await service.heartbeat({ host: 'PC' });
    await service.reportFolders('q1', {
      host: 'PC',
      folder: 'D:\\Isler\\20-10-2026--sali\\ozturk-reklam',
      problems: ['kullanımda'],
    });
    expect(quote).toMatchObject({
      foldersPath: 'D:\\Isler\\20-10-2026--sali\\ozturk-reklam',
      foldersHost: 'PC',
      foldersNote: 'kullanımda',
    });
    expect((quote as Record<string, unknown>).foldersCreatedAt).toBeInstanceOf(Date);
    expect(rows[0].lastJobQuoteNo).toBe('TKF-2026-0007');
  });

  it('bilinmeyen teklif için 404', async () => {
    const { service } = build();
    await expect(service.reportFolders('yok', { host: 'PC', folder: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
