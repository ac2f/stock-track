import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ProcessingStatus } from '../../common/enums/processing-status.enum';
import { QuoteStatus } from '../../common/enums/quote-status.enum';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { StockLevel } from '../materials/entities/stock-level.entity';
import { ProcessingJob } from '../processing/entities/processing-job.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { SettingsService } from '../settings/settings.service';
import {
  NotificationChannel,
  NotificationType,
} from './enums/notification.enums';
import { NotificationsService } from './notifications.service';
import { ShopAccessService } from '../shops/shop-access.service';
import {
  buildMorningSummary,
  plateText,
  SummaryLow,
  SummaryNeed,
} from './morning-summary.util';

const TIME_ZONE = process.env.MORNING_SUMMARY_TZ || 'Europe/Istanbul';

/**
 * Sabah özeti: her sabah (MORNING_SUMMARY_CRON, varsayılan 08:00, Türkiye
 * saati) Telegram'a günün bekleyen işleri, gereken plakalar ve stok
 * durumu, azalan stok ve onaylanıp işe dönüşmemiş teklifler. Ayarlar'dan
 * açılır; SCHEDULER_ENABLED=false ise zamanlı gönderim çalışmaz.
 */
@Injectable()
export class MorningSummaryService {
  private readonly logger = new Logger(MorningSummaryService.name);
  private readonly schedulerEnabled: boolean;

  constructor(
    @InjectRepository(ProcessingJob)
    private readonly jobsRepo: Repository<ProcessingJob>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    @InjectRepository(StockLevel)
    private readonly levelsRepo: Repository<StockLevel>,
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly shops: ShopAccessService,
    configService: ConfigService,
  ) {
    this.schedulerEnabled =
      configService.get<boolean>('scheduler.enabled') ?? true;
  }

  @Cron(process.env.MORNING_SUMMARY_CRON || '0 8 * * *', {
    timeZone: TIME_ZONE,
  })
  async scheduled(): Promise<void> {
    if (!this.schedulerEnabled) return;
    // Her dükkânın özeti kendi sohbetine; özeti kapalı dükkân atlanır.
    await this.shops.forEachShop('Sabah özeti', async () => {
      if (!(await this.settings.getMorningSummary()).enabled) return;
      await this.send();
    });
  }

  /** Özeti üretir ve Telegram'a gönderir; gönderilen metni döner. */
  async send(): Promise<string> {
    const text = await this.build();
    await this.notifications.notify({
      type: NotificationType.MORNING_SUMMARY,
      subject: 'Sabah özeti',
      body: text,
      channels: [NotificationChannel.LOG, NotificationChannel.TELEGRAM],
    });
    this.logger.log('Sabah özeti gönderildi.');
    return text;
  }

  /** Özet metni (göndermeden). */
  async build(): Promise<string> {
    const business = await this.settings.getBusiness();

    const jobs = await this.jobsRepo.find({
      where: {
        status: In([ProcessingStatus.PENDING, ProcessingStatus.IN_PROGRESS]),
      },
      relations: ['machine', 'customer'],
      order: { processedAt: 'ASC' },
    });

    // Henüz stoğu düşülmemiş işlerin plakaları: gereken ve mevcut adet.
    const neededBy = new Map<string, number>();
    for (const j of jobs) {
      if (j.stockConsumed) continue;
      neededBy.set(
        j.plateId,
        (neededBy.get(j.plateId) ?? 0) + Number(j.quantity),
      );
    }
    const needs: SummaryNeed[] = [];
    if (neededBy.size > 0) {
      const ids = [...neededBy.keys()];
      const levels = await this.levelsRepo.find({
        where: { plateId: In(ids) },
      });
      const stockBy = new Map<string, number>();
      for (const l of levels) {
        stockBy.set(
          l.plateId,
          (stockBy.get(l.plateId) ?? 0) + Number(l.quantity),
        );
      }
      const plates = await this.platesRepo.find({
        where: { id: In(ids) },
        withDeleted: true,
      });
      for (const p of plates) {
        needs.push({
          plate: plateText(p),
          needed: neededBy.get(p.id) ?? 0,
          inStock: stockBy.get(p.id) ?? 0,
        });
      }
      needs.sort((a, b) => b.needed - b.inStock - (a.needed - a.inStock));
    }

    const lowPlates = await this.platesRepo.find({
      where: { isActive: true, reorderLevel: Not(IsNull()) },
    });
    const low: SummaryLow[] = lowPlates
      .filter((p) => Number(p.quantityInStock) <= Number(p.reorderLevel))
      .map((p) => ({
        plate: plateText(p),
        inStock: Number(p.quantityInStock),
        reorderLevel: Number(p.reorderLevel),
      }));

    const quotes = await this.quotesRepo.find({
      where: { status: QuoteStatus.ACCEPTED },
      order: { createdAt: 'ASC' },
    });

    return buildMorningSummary({
      business: business.name,
      date: new Date(),
      timeZone: TIME_ZONE,
      jobs: jobs.map((j) => ({
        machine: j.machine?.name ?? null,
        customer: j.customer?.companyName || j.customer?.name || null,
        plate: plateText(j.plate),
        quantity: Number(j.quantity),
        minutes: j.durationMinutes != null ? Number(j.durationMinutes) : null,
      })),
      needs,
      low,
      quotes: quotes.map((q) => ({
        quoteNo: q.quoteNo,
        customer: q.buyerCustomer?.companyName || q.buyerCustomer?.name || '',
        total: Number(q.total),
        currency: q.currency,
      })),
    });
  }
}
