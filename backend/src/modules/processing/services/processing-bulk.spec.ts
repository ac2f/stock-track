import { ProcessingService } from './processing.service';

/**
 * Toplu tarih düzenleme: her iş için tek tek `update` çağrılır (cari tarihi
 * ve ekstre aynı yoldan güncellenir); biri başarısız olursa diğerleri sürer.
 */
describe('ProcessingService.bulkUpdate', () => {
  function build(findOne: (id: string) => { processedAt: Date } = () => ({ processedAt: new Date('2026-03-01T00:00:00Z') })) {
    const update = jest.fn((_id: string, _patch: unknown) => Promise.resolve({}));
    const fake = {
      update,
      findOne: jest.fn((id: string) => Promise.resolve(findOne(id))),
    };
    const run = (dto: Parameters<ProcessingService['bulkUpdate']>[0]) =>
      ProcessingService.prototype.bulkUpdate.call(fake, dto);
    return { run, update, fake };
  }

  it('verilen alanları her işe uygular, verilmeyene dokunmaz', async () => {
    const { run, update } = build();
    const res = await run({ ids: ['a', 'b'], processedAt: '2026-03-05', note: 'toplu' });
    expect(res).toEqual({ updated: 2, failed: [] });
    expect(update).toHaveBeenCalledWith('a', { processedAt: '2026-03-05', note: 'toplu' });
    expect(update).toHaveBeenCalledWith('b', { processedAt: '2026-03-05', note: 'toplu' });
  });

  it('aynı kimliği iki kez işlemez', async () => {
    const { run, update } = build();
    const res = await run({ ids: ['a', 'a'], completedAt: '2026-03-06' });
    expect(res.updated).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('sameDay: yeni işlenme tarihi verilmişse tamamlanma da o gündür', async () => {
    const { run, update } = build();
    await run({ ids: ['a'], processedAt: '2026-03-07', sameDay: true });
    expect(update).toHaveBeenCalledWith('a', { processedAt: '2026-03-07', completedAt: '2026-03-07' });
  });

  it('sameDay: tarih verilmediyse her işin kendi işlenme günü kullanılır', async () => {
    const { run, update } = build((id) => ({
      processedAt: new Date(id === 'a' ? '2026-01-10T00:00:00Z' : '2026-02-20T00:00:00Z'),
    }));
    await run({ ids: ['a', 'b'], sameDay: true });
    expect(update).toHaveBeenCalledWith('a', {
      processedAt: '2026-01-10T00:00:00.000Z',
      completedAt: '2026-01-10T00:00:00.000Z',
    });
    expect(update).toHaveBeenCalledWith('b', {
      processedAt: '2026-02-20T00:00:00.000Z',
      completedAt: '2026-02-20T00:00:00.000Z',
    });
  });

  it('boş not notu siler (undefined değil)', async () => {
    const { run, update } = build();
    await run({ ids: ['a'], note: '' });
    expect(update).toHaveBeenCalledWith('a', { note: '' });
  });

  it('bir iş başarısız olursa diğerleri sürer ve hata raporlanır', async () => {
    const { run, update } = build();
    update.mockImplementationOnce(() => Promise.reject(new Error('İş bulunamadı.')));
    const res = await run({ ids: ['x', 'y'], completedAt: '2026-03-08' });
    expect(res.updated).toBe(1);
    expect(res.failed).toEqual([{ id: 'x', reason: 'İş bulunamadı.' }]);
  });

  it('hiçbir alan verilmediyse güncelleme çağrılmaz', async () => {
    const { run, update } = build();
    const res = await run({ ids: ['a'] });
    expect(res).toEqual({ updated: 0, failed: [] });
    expect(update).not.toHaveBeenCalled();
  });
});
