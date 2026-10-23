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
      update: jest.fn(async (where, patch) => {
        const id = typeof where === 'string' ? where : where.id;
        const row = rows.find((r) => r.id === id)!;
        if (typeof where !== 'string' && 'offlineNotifiedAt' in where && row.offlineNotifiedAt) {
          return { affected: 0 };
        }
        Object.assign(row, patch);
        return { affected: 1 };
      }),
      find: jest.fn(async () => rows),
      delete: jest.fn(),
    };
    const quotesRepo = {
      findOne: jest.fn(async ({ where: { id } }) => quotes.find((q) => q.id === id) ?? null),
      update: jest.fn(async (id, patch) => Object.assign(quotes.find((q) => q.id === id)!, patch)),
    };
    const notifications = { notify: jest.fn(async (_p: Record<string, unknown>) => undefined) };
    return {
      service: new CorelRunnerService(runnersRepo as never, quotesRepo as never, notifications as never),
      rows,
      quotes,
      notifications,
    };
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

  it('Telegram: klasör açıldı, sorun bir kez, düzelince haber; koptu ve geri geldi', async () => {
    const quote = { id: 'q1', quoteNo: 'TKF-2026-0007', buyerCustomer: { name: 'Ali', companyName: 'Öztürk Reklam' } };
    const { service, rows, notifications } = build([quote]);
    const subjects = () => notifications.notify.mock.calls.map((c: any[]) => c[0].subject);

    await service.heartbeat({ host: 'PC' });
    await service.reportFolders('q1', { host: 'PC', folder: 'D:\\Isler\\x', report: ['yeni:  001-pleksi'] });
    expect(subjects()).toEqual(['📁 Klasörler açıldı: TKF-2026-0007 · Öztürk Reklam']);
    expect(notifications.notify.mock.calls[0][0]).toMatchObject({ type: 'corel_folders' });

    await service.heartbeat({ host: 'PC', error: 'Gün klasörü bilinmiyor' });
    await service.heartbeat({ host: 'PC', error: 'Gün klasörü bilinmiyor' });
    await service.heartbeat({ host: 'PC', error: null });
    // Hemen tekrar bozulup düzelirse (10 dk dolmadan) yeni mesaj yok.
    await new Promise((r) => setTimeout(r, 5));
    await service.heartbeat({ host: 'PC', error: 'Klasör açılamadı' });
    await service.heartbeat({ host: 'PC', error: null });
    expect(subjects().slice(1)).toEqual(['⚠️ Runner sorun bildirdi', '✅ Runner sorunu giderildi']);

    // Nabız kesildi: bir kez "koptu", nabız gelince "yeniden bağlandı".
    const later = new Date(Date.now() + 5 * 60 * 1000);
    expect(await service.alertOffline(later)).toBe(1);
    expect(await service.alertOffline(later)).toBe(0);
    await service.heartbeat({ host: 'PC' });
    expect(subjects().slice(3)).toEqual(['🔴 Runner bağlantısı koptu', '🟢 Runner yeniden bağlandı']);
    expect(rows[0].offlineNotifiedAt).toBeNull();
  });

  it('bilinmeyen teklif için 404', async () => {
    const { service } = build();
    await expect(service.reportFolders('yok', { host: 'PC', folder: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
