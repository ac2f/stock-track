import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SyncFeedService } from './sync-feed.service';

/**
 * Merkezde eski değişiklik günlüğünü siler (SYNC_RETENTION_DAYS, varsayılan
 * 30 gün). Bundan uzun süre bağlanmayan yerel sunucu baştan yüklenir.
 * SCHEDULER_ENABLED=false (ve yerel sunucuda) çalışmaz.
 */
@Injectable()
export class SyncPruneScheduler {
  private readonly logger = new Logger(SyncPruneScheduler.name);
  private readonly enabled: boolean;
  private readonly retentionDays: number;

  constructor(
    private readonly feed: SyncFeedService,
    config: ConfigService,
  ) {
    this.enabled =
      (config.get<boolean>('scheduler.enabled') ?? true) && config.get('sync.role') !== 'replica';
    this.retentionDays = config.get<number>('sync.retentionDays') ?? 30;
  }

  @Cron('17 4 * * *')
  async prune(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.feed.prune(this.retentionDays);
    } catch (err) {
      this.logger.warn(`Eşitleme günlüğü temizlenemedi: ${(err as Error).message}`);
    }
  }
}
