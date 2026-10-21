import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from '../quotes/entities/quote.entity';
import { CorelRunner } from './entities/corel-runner.entity';
import { JobFoldersDto, RunnerHeartbeatDto } from './dto/runner.dto';
import { ShopContext } from '../../common/shop/shop-context';

/** Arayüzde gösterilen runner durumu. */
export interface RunnerView {
  id: string;
  host: string;
  version: string | null;
  startedAt: Date | null;
  lastSeenAt: Date;
  /** Son nabızdan bu yana geçen saniye. */
  secondsAgo: number;
  /** Beklenen sürede nabız geldi mi (3 tur + 15 sn). */
  online: boolean;
  pollSeconds: number;
  dayRoot: string | null;
  dayRootSource: string | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  lastJobQuoteNo: string | null;
  lastJobAt: Date | null;
  lastFolder: string | null;
}

/**
 * Dükkân bilgisayarındaki runner'ın nabzı ve açtığı klasörlerin kaydı.
 * Böylece "runner bağlı mı, çalışıyor mu, bu teklifin klasörü açıldı mı"
 * sorusu StockTrack ekranından cevaplanır.
 */
@Injectable()
export class CorelRunnerService {
  constructor(
    @InjectRepository(CorelRunner)
    private readonly runnersRepo: Repository<CorelRunner>,
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
  ) {}

  static isOnline(r: Pick<CorelRunner, 'lastSeenAt' | 'pollSeconds'>, now = new Date()): boolean {
    const limitMs = ((r.pollSeconds || 30) * 3 + 15) * 1000;
    return now.getTime() - new Date(r.lastSeenAt).getTime() <= limitMs;
  }

  async heartbeat(dto: RunnerHeartbeatDto): Promise<{ ok: true; serverTime: string }> {
    const now = new Date();
    const host = dto.host.trim();
    const error = dto.error?.trim() || null;
    const row = (await this.runnersRepo.findOne({ where: { host } })) ?? this.runnersRepo.create({ host });
    row.version = dto.version ?? row.version ?? null;
    row.startedAt = dto.startedAt ? new Date(dto.startedAt) : row.startedAt ?? null;
    row.lastSeenAt = now;
    row.pollSeconds = dto.pollSeconds ?? row.pollSeconds ?? 30;
    if (dto.dayRoot !== undefined) row.dayRoot = dto.dayRoot || null;
    if (dto.dayRootSource !== undefined) row.dayRootSource = dto.dayRootSource || null;
    // Aynı hata sürdükçe ilk görüldüğü an korunur.
    if (error && error !== row.lastError) row.lastErrorAt = now;
    row.lastError = error;
    await this.runnersRepo.save(row);
    return { ok: true, serverTime: now.toISOString() };
  }

  /** Runner bir teklifin klasörlerini açtı (ya da zaten açıktı). */
  async reportFolders(quoteId: string, dto: JobFoldersDto): Promise<{ ok: true }> {
    const quote = await this.quotesRepo.findOne({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException('Teklif bulunamadı.');
    // Yerel sunucudan aktarılan bildirimde klasörün asıl açıldığı an.
    const now = ShopContext.now();
    const host = dto.host.trim();
    await this.quotesRepo.update(quoteId, {
      foldersCreatedAt: now,
      foldersPath: dto.folder,
      foldersHost: host,
      foldersNote: dto.problems?.length ? dto.problems.join('\n') : null,
    });
    const row = await this.runnersRepo.findOne({ where: { host } });
    if (row) {
      await this.runnersRepo.update(row.id, {
        lastJobQuoteNo: quote.quoteNo,
        lastJobAt: now,
        lastFolder: dto.folder,
      });
    }
    return { ok: true };
  }

  async list(): Promise<RunnerView[]> {
    const now = new Date();
    const rows = await this.runnersRepo.find({ order: { lastSeenAt: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      host: r.host,
      version: r.version ?? null,
      startedAt: r.startedAt ?? null,
      lastSeenAt: r.lastSeenAt,
      secondsAgo: Math.max(0, Math.round((now.getTime() - new Date(r.lastSeenAt).getTime()) / 1000)),
      online: CorelRunnerService.isOnline(r, now),
      pollSeconds: r.pollSeconds,
      dayRoot: r.dayRoot ?? null,
      dayRootSource: r.dayRootSource ?? null,
      lastError: r.lastError ?? null,
      lastErrorAt: r.lastErrorAt ?? null,
      lastJobQuoteNo: r.lastJobQuoteNo ?? null,
      lastJobAt: r.lastJobAt ?? null,
      lastFolder: r.lastFolder ?? null,
    }));
  }

  /** Listeden kaldır (bilgisayar artık kullanılmıyorsa). */
  async remove(id: string): Promise<void> {
    await this.runnersRepo.delete({ id });
  }
}
