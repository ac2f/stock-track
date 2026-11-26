import { ConflictException } from '@nestjs/common';
import { QuotesService } from './quotes.service';

/**
 * Bir teklif aynı anda iki kez dönüştürülemez (çift tıklama, çevrimdışı kuyruğun yeniden göndermesi): gerçek
 * veritabanında 6 eşzamanlı dönüştürme 6 satış açıyor, stok ve cari 6 kez düşüyordu. Dönüştürme, kabul,
 * düzenleme ve silme teklif başına danışma kilidi altında çalışır; kilit alınamazsa 409, iş biterse kilit bırakılır.
 */
describe('teklif kilidi', () => {
  function build(lockFree: boolean) {
    const calls: string[] = [];
    const runner = {
      connect: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
      query: jest.fn(async (sql: string) => {
        calls.push(sql.includes('unlock') ? 'unlock' : 'lock');
        return [{ locked: lockFree }];
      }),
    };
    const service = Object.create(QuotesService.prototype) as QuotesService;
    Object.assign(service, { dataSource: { createQueryRunner: () => runner } });
    return { service, runner, calls };
  }

  it('teklif başka bir işlemdeyse dönüştürme 409 döner ve hiçbir şey yapmaz', async () => {
    const { service, runner, calls } = build(false);
    const work = jest.spyOn(service as never, 'convertLocked' as never).mockResolvedValue({} as never);
    await expect(service.convert('q1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(work).not.toHaveBeenCalled();
    expect(calls).toEqual(['lock']);
    expect(runner.release).toHaveBeenCalled();
  });

  it('kilit alınınca iş yapılır; hata verse de kilit bırakılır', async () => {
    const { service, runner, calls } = build(true);
    jest.spyOn(service as never, 'removeLocked' as never).mockRejectedValue(new Error('boom') as never);
    await expect(service.remove('q1')).rejects.toThrow('boom');
    expect(calls).toEqual(['lock', 'unlock']);
    expect(runner.release).toHaveBeenCalled();
  });

  it('kabul ve dönüştürme aynı anahtarla kilitlenir', async () => {
    const { service, runner } = build(true);
    jest.spyOn(service as never, 'setStatusLocked' as never).mockResolvedValue({} as never);
    jest.spyOn(service as never, 'convertLocked' as never).mockResolvedValue({} as never);
    await service.setStatus('q9', 'accepted' as never);
    await service.convert('q9', 'u');
    const keys = runner.query.mock.calls.filter(([sql]) => !String(sql).includes('unlock')).map((c) => (c as unknown[])[1]);
    expect(keys).toEqual([['quote:q9'], ['quote:q9']]);
  });
});
