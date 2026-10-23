import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ShopAccessService } from '../shops/shop-access.service';
import { isReplicaRole } from '../sync/sync-role';
import { CorelRunnerService } from './corel-runner.service';

/** Kaç ms'de bir nabzı kesilen runner aranır. */
const CHECK_MS = 2 * 60 * 1000;

/**
 * Nabzı kesilen runner'ı dükkânın Telegram'ına bildirir ("Corel ve
 * klasörler" konusu). Yerel sunucuda çalışmaz (bildirimler merkezden).
 */
@Injectable()
export class CorelRunnerAlertScheduler {
  private readonly logger = new Logger(CorelRunnerAlertScheduler.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly runners: CorelRunnerService,
    private readonly shops: ShopAccessService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('scheduler.enabled') ?? true;
  }

  @Interval(CHECK_MS)
  async check(): Promise<void> {
    if (!this.enabled || this.running || isReplicaRole()) return;
    this.running = true;
    try {
      await this.shops.forEachShop('Runner bağlantısı', async () => {
        const n = await this.runners.alertOffline();
        if (n) this.logger.log(`${n} runner için bağlantı koptu bildirimi`);
      });
    } finally {
      this.running = false;
    }
  }
}
