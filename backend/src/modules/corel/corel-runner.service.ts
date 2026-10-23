import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { Quote } from '../quotes/entities/quote.entity';
import { CorelRunner } from './entities/corel-runner.entity';
import { JobFoldersDto, RunnerHeartbeatDto } from './dto/runner.dto';
import { ShopContext } from '../../common/shop/shop-context';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification.enums';

/** Aynı runner için iki sorun bildirimi arasında en az bu kadar. */
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
/** Bundan uzun süredir nabzı olmayan runner için "koptu" denmez (artık kullanılmıyor). */
const OFFLINE_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  private readonly logger = new Logger(CorelRunnerService.name);

  constructor(
    @InjectRepository(CorelRunner)
    private readonly runnersRepo: Repository<CorelRunner>,
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Corel/klasör konusunda Telegram bildirimi (dükkânın "Corel ve
   * klasörler" hedefine). Bildirim hatası nabzı ya da raporu bozmaz.
   */
  private async alert(type: NotificationType, subject: string, body: string): Promise<void> {
    try {
      await this.notifications.notify({ type, subject, body, relatedType: 'corel-runner' });
    } catch (err) {
      this.logger.warn(`Runner bildirimi gönderilemedi: ${(err as Error).message}`);
    }
  }

  static isOnline(r: Pick<CorelRunner, 'lastSeenAt' | 'pollSeconds'>, now = new Date()): boolean {
    const limitMs = ((r.pollSeconds || 30) * 3 + 15) * 1000;
    return now.getTime() - new Date(r.lastSeenAt).getTime() <= limitMs;
  }

  async heartbeat(dto: RunnerHeartbeatDto): Promise<{ ok: true; serverTime: string }> {
    const now = new Date();
    const host = dto.host.trim();
    const error = dto.error?.trim() || null;
    const row = (await this.runnersRepo.findOne({ where: { host } })) ?? this.runnersRepo.create({ host });
    const prevError = row.lastError ?? null;
    const wasOffline = !!row.offlineNotifiedAt;
    row.version = dto.version ?? row.version ?? null;
    row.startedAt = dto.startedAt ? new Date(dto.startedAt) : row.startedAt ?? null;
    row.lastSeenAt = now;
    row.pollSeconds = dto.pollSeconds ?? row.pollSeconds ?? 30;
    if (dto.dayRoot !== undefined) row.dayRoot = dto.dayRoot || null;
    if (dto.dayRootSource !== undefined) row.dayRootSource = dto.dayRootSource || null;
    // Aynı hata sürdükçe ilk görüldüğü an korunur.
    if (error && error !== row.lastError) row.lastErrorAt = now;
    row.lastError = error;
    row.offlineNotifiedAt = null;

    // Telegram: koptu denmişse "geri geldi"; yeni sorun (10 dk'da en çok bir)
    // ve bildirilmiş sorunun düzelmesi.
    const notices: [string, string][] = [];
    if (wasOffline) notices.push(['🟢 Runner yeniden bağlandı', `${host} yeniden çalışıyor.`]);
    const lastAlert = row.alertNotifiedAt ? new Date(row.alertNotifiedAt).getTime() : 0;
    if (error && !prevError && now.getTime() - lastAlert >= ALERT_COOLDOWN_MS) {
      notices.push(['⚠️ Runner sorun bildirdi', `${host}: ${error}`]);
      row.alertNotifiedAt = now;
    } else if (!error && prevError && row.lastErrorAt && lastAlert >= new Date(row.lastErrorAt).getTime()) {
      notices.push(['✅ Runner sorunu giderildi', `${host} yeniden sorunsuz çalışıyor.`]);
    }
    await this.runnersRepo.save(row);
    for (const [subject, body] of notices) await this.alert(NotificationType.COREL_RUNNER, subject, body);
    return { ok: true, serverTime: now.toISOString() };
  }

  /**
   * Nabzı kesilen runner'lar için bir kez "bağlantısı koptu" bildirimi
   * (zamanlanmış görev, dükkân başına çağrılır). Bildirilenlerin sayısı.
   */
  async alertOffline(now = new Date()): Promise<number> {
    const rows = await this.runnersRepo.find({
      where: {
        offlineNotifiedAt: IsNull(),
        lastSeenAt: MoreThan(new Date(now.getTime() - OFFLINE_ALERT_WINDOW_MS)),
      },
    });
    let sent = 0;
    for (const r of rows) {
      if (CorelRunnerService.isOnline(r, now)) continue;
      // Koşullu yazım: aynı anda iki süreç bakarsa yalnız biri bildirir.
      const res = await this.runnersRepo.update(
        { id: r.id, offlineNotifiedAt: IsNull() },
        { offlineNotifiedAt: now },
      );
      if (res.affected === 0) continue;
      const seen = new Date(r.lastSeenAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
      await this.alert(
        NotificationType.COREL_RUNNER,
        '🔴 Runner bağlantısı koptu',
        `${r.host} son nabız ${seen}. Teklifler işe dönse de bu bilgisayarda klasör açılmaz; ` +
          'bilgisayarı ve StockTrack Runner Durumu penceresini kontrol edin.',
      );
      sent++;
    }
    return sent;
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
    const customer = quote.buyerCustomer?.companyName?.trim() || quote.buyerCustomer?.name || '';
    const lines = [
      dto.folder,
      ...(dto.report ?? []).filter((r) => !r.startsWith('zaten')).slice(0, 8),
      ...(dto.problems ?? []).map((p) => `⚠️ ${p}`),
      `(${host})`,
    ];
    await this.alert(
      NotificationType.COREL_FOLDERS,
      `📁 Klasörler açıldı: ${quote.quoteNo}${customer ? ` · ${customer}` : ''}`,
      lines.join('\n'),
    );
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
