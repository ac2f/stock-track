import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProcessingStatus } from '../../common/enums/processing-status.enum';
import { ShopContext } from '../../common/shop/shop-context';
import { ProcessingJob } from '../processing/entities/processing-job.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { CutReportDto } from './dto/cut-report.dto';
import { CorelCutReport, CutReportSheet } from './entities/corel-cut-report.entity';

const mm = (v: number | null | undefined) => (v == null ? '' : String(Math.round(Number(v))));

/** Teklif kartında görünen kısa özet: "2 tabaka · 34 dk · kalan 1220×900". */
export function cutReportSummary(dto: Pick<CutReportDto, 'sheets' | 'minutes' | 'toolpaths' | 'files'>): string {
  const parts = [`${dto.sheets.length} tabaka`];
  if (dto.minutes != null && Number(dto.minutes) > 0) parts.push(`${Math.round(Number(dto.minutes) * 10) / 10} dk`);
  if (dto.toolpaths) parts.push(`${dto.toolpaths} takım yolu`);
  const offcuts = dto.sheets
    .filter((s) => s.offcutWidthMm && s.offcutHeightMm)
    .map((s) => `${mm(s.offcutWidthMm)}×${mm(s.offcutHeightMm)}`);
  if (offcuts.length) parts.push(`kalan ${offcuts.slice(0, 4).join(', ')}${offcuts.length > 4 ? '…' : ''}`);
  if (dto.files?.length) parts.push(`${dto.files.length} dosya`);
  return parts.join(' · ');
}

/**
 * iyiCAM'den gelen kesim raporu. Kaydedilir, teklifte özeti görünür ve aynı
 * teklifin bekleyen işleme kayıtlarına ÖNERİLEN fire ebadı yazılır.
 *
 * Hiçbir şeyi kendiliğinden değiştirmez: teklifin fiyatı ve kullanılan alanı,
 * işin ücreti ve stok olduğu gibi kalır. Fire, kullanıcı "Tamamla" dediğinde
 * (önceden dolmuş alanlarla, değiştirebilerek) stoğa eklenir.
 */
@Injectable()
export class CorelCutReportService {
  constructor(
    @InjectRepository(CorelCutReport)
    private readonly reportsRepo: Repository<CorelCutReport>,
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(ProcessingJob)
    private readonly jobsRepo: Repository<ProcessingJob>,
  ) {}

  async report(
    quoteId: string,
    dto: CutReportDto,
  ): Promise<{ ok: true; reportId: string; summary: string; suggested: number }> {
    const quote = await this.quotesRepo.findOne({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException('Teklif bulunamadı.');
    const now = ShopContext.now();
    const host = dto.host.trim();

    // Teklif kaleminden gelen tabakanın stok kalemi (plaka) teklifin kendisinden.
    const plateOfItem = new Map((quote.items ?? []).map((i) => [i.id, i.plateId ?? null] as const));
    const sheets: CutReportSheet[] = dto.sheets.map((s) => ({
      plateId: s.plateId ?? (s.quoteItemId ? plateOfItem.get(s.quoteItemId) ?? null : null),
      quoteItemId: s.quoteItemId && plateOfItem.has(s.quoteItemId) ? s.quoteItemId : null,
      label: s.label ?? null,
      thicknessMm: s.thicknessMm ?? null,
      sheetWidthMm: s.sheetWidthMm,
      sheetHeightMm: s.sheetHeightMm,
      usedWidthMm: s.usedWidthMm ?? null,
      usedHeightMm: s.usedHeightMm ?? null,
      offcutWidthMm: s.offcutWidthMm ?? null,
      offcutHeightMm: s.offcutHeightMm ?? null,
    }));

    const saved = await this.reportsRepo.save(
      this.reportsRepo.create({
        quoteId,
        host,
        project: dto.project ?? null,
        folder: dto.folder ?? null,
        minutes: dto.minutes ?? null,
        toolpaths: dto.toolpaths ?? null,
        areaM2: dto.areaM2 ?? null,
        sheets,
        files: dto.files ?? [],
        note: dto.note ?? null,
      }),
    );
    const summary = cutReportSummary(dto);
    await this.quotesRepo.update(quoteId, { cutReportAt: now, cutReportHost: host, cutReportSummary: summary });
    const suggested = await this.suggestOffcuts(quoteId, sheets, now);
    return { ok: true, reportId: saved.id, summary, suggested };
  }

  /**
   * Teklifin bekleyen / işlenen işlerine, aynı plakanın kalan parçasını öneri
   * olarak yazar (her tabakanın kalanı bir işe). Önerilen iş sayısı.
   */
  private async suggestOffcuts(quoteId: string, sheets: CutReportSheet[], now: Date): Promise<number> {
    const left = sheets.filter((s) => s.plateId && s.offcutWidthMm && s.offcutHeightMm);
    if (!left.length) return 0;
    const jobs = await this.jobsRepo.find({
      where: { quoteId, status: In([ProcessingStatus.PENDING, ProcessingStatus.IN_PROGRESS]) },
      order: { createdAt: 'ASC' },
    });
    let n = 0;
    for (const job of jobs) {
      const i = left.findIndex((s) => s.plateId === job.plateId);
      if (i < 0) continue;
      const [s] = left.splice(i, 1);
      await this.jobsRepo.update(job.id, {
        suggestedOffcutWidthMm: s.offcutWidthMm,
        suggestedOffcutHeightMm: s.offcutHeightMm,
        suggestedOffcutAt: now,
      });
      n++;
    }
    return n;
  }

  /** Teklifin kesim raporları, yeniden eskiye (arayüz). */
  list(quoteId: string): Promise<CorelCutReport[]> {
    return this.reportsRepo.find({ where: { quoteId }, order: { createdAt: 'DESC' }, take: 20 });
  }
}
