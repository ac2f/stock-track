import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CurrencyService } from './currency.service';

/**
 * Döviz kurlarını harici API'den periyodik çeker (config-gated).
 * EXCHANGE_RATE_API_URL boşsa veya SCHEDULER_ENABLED=false ise çalışmaz.
 * Cluster'da mükerrer çalışmayı önlemek için SCHEDULER_ENABLED tek replikada açılır.
 */
@Injectable()
export class ExchangeRateScheduler {
  private readonly logger = new Logger(ExchangeRateScheduler.name);
  private readonly apiUrl?: string;
  private readonly enabled: boolean;

  constructor(
    private readonly currencyService: CurrencyService,
    configService: ConfigService,
  ) {
    this.apiUrl = configService.get<string>('currency.apiUrl') || undefined;
    this.enabled =
      (configService.get<boolean>('scheduler.enabled') ?? true) && !!this.apiUrl;
  }

  @Cron(process.env.EXCHANGE_RATE_SYNC_CRON || '0 6 * * *')
  async handle(): Promise<void> {
    if (!this.enabled || !this.apiUrl) {
      return;
    }
    this.logger.log('Döviz kuru senkronizasyonu başladı.');
    await this.currencyService.syncFromApi(this.apiUrl);
  }
}
