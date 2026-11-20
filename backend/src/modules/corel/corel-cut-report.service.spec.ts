import { NotFoundException } from '@nestjs/common';
import { CorelCutReportService, cutReportSummary } from './corel-cut-report.service';

/** iyiCAM kesim raporu: kaydedilir, teklife özet, bekleyen işe ÖNERİLEN fire; fiyat/stok değişmez. */
describe('CorelCutReportService', () => {
  function build(quotes: Record<string, any>[], jobs: Record<string, any>[] = []) {
    const reports: Record<string, any>[] = [];
    const reportsRepo = {
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => {
        x.id = `r${reports.length + 1}`;
        reports.push(x);
        return x;
      }),
      find: jest.fn(async () => reports),
    };
    const quotesRepo = {
      findOne: jest.fn(async ({ where: { id } }) => quotes.find((q) => q.id === id) ?? null),
      update: jest.fn(async (id, patch) => Object.assign(quotes.find((q) => q.id === id)!, patch)),
    };
    const jobsRepo = {
      find: jest.fn(async ({ where }) =>
        jobs.filter((j) => j.quoteId === where.quoteId && ['pending', 'in_progress'].includes(j.status)),
      ),
      update: jest.fn(async (id, patch) => Object.assign(jobs.find((j) => j.id === id)!, patch)),
    };
    return {
      service: new CorelCutReportService(reportsRepo as never, quotesRepo as never, jobsRepo as never),
      reports,
      jobsRepo,
    };
  }

  const sheet = (over: Record<string, unknown> = {}) => ({
    sheetWidthMm: 1220,
    sheetHeightMm: 2440,
    usedWidthMm: 1220,
    usedHeightMm: 1500,
    offcutWidthMm: 1220,
    offcutHeightMm: 940,
    ...over,
  });

  it('raporu kaydeder, teklifin özetini yazar, teklifin fiyatına dokunmaz', async () => {
    const quote = { id: 'q1', quoteNo: 'TKF-1', totalAmount: 1500, items: [{ id: 'i1', plateId: 'p1' }] };
    const { service, reports } = build([quote]);
    const res = await service.report('q1', {
      host: 'CNC-PC',
      minutes: 34.26,
      toolpaths: 3,
      sheets: [sheet({ quoteItemId: 'i1' })],
      files: ['001d6-o_kesim.nc'],
    });
    expect(res.ok).toBe(true);
    expect(reports[0].sheets[0].plateId).toBe('p1'); // teklif kaleminden plaka bulundu
    expect(quote).toMatchObject({ cutReportHost: 'CNC-PC', totalAmount: 1500 });
    expect((quote as any).cutReportSummary).toBe('1 tabaka · 34.3 dk · 3 takım yolu · kalan 1220×940 · 1 dosya');
  });

  it('bekleyen işe aynı plakanın kalanını ÖNERİR; tamamlanmış ve başka plakanın işi değişmez', async () => {
    const jobs: Record<string, any>[] = [
      { id: 'j1', quoteId: 'q1', plateId: 'p1', status: 'pending', totalCost: 300 },
      { id: 'j2', quoteId: 'q1', plateId: 'p2', status: 'pending', totalCost: 200 },
      { id: 'j3', quoteId: 'q1', plateId: 'p1', status: 'completed', totalCost: 100 },
    ];
    const { service } = build([{ id: 'q1', items: [] }], jobs);
    const res = await service.report('q1', { host: 'PC', sheets: [sheet({ plateId: 'p1' })] });
    expect(res.suggested).toBe(1);
    expect(jobs[0]).toMatchObject({ suggestedOffcutWidthMm: 1220, suggestedOffcutHeightMm: 940, totalCost: 300 });
    expect(jobs[1].suggestedOffcutWidthMm).toBeUndefined();
    expect(jobs[2].suggestedOffcutWidthMm).toBeUndefined();
  });

  it('kalanı olmayan rapor işe bir şey yazmaz', async () => {
    const { service, jobsRepo } = build([{ id: 'q1', items: [] }]);
    const res = await service.report('q1', {
      host: 'PC',
      sheets: [sheet({ plateId: 'p1', offcutWidthMm: null, offcutHeightMm: null })],
    });
    expect(res.suggested).toBe(0);
    expect(jobsRepo.find).not.toHaveBeenCalled();
  });

  it('teklif yoksa 404', async () => {
    const { service } = build([]);
    await expect(service.report('yok', { host: 'PC', sheets: [] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('özet en çok dört kalan parça yazar', () => {
    const s = cutReportSummary({ sheets: Array.from({ length: 5 }, () => sheet()), minutes: 0 });
    expect(s).toBe('5 tabaka · kalan 1220×940, 1220×940, 1220×940, 1220×940…');
  });
});
