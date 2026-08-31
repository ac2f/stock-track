import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CurrencyService } from './currency.service';

/**
 * Döviz kurlarını harici API'den periyodik çeker.
 * EXCHANGE_RATE_API_URL verilmezse anahtar gerektirmeyen açık sağlayıcılar
 * kullanılır (bkz. CurrencyService.DEFAULT_API_URLS); SCHEDULER_ENABLED=false
 * ise çalışmaz.
 * Cluster'da mükerrer çalışmayı önlemek için SCHEDULER_ENABLED tek replikada açılır.
 */
@Injectable()
export class ExchangeRateScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExchangeRateScheduler.name);
  private readonly apiUrl?: string;
  private readonly enabled: boolean;

  constructor(
    private readonly currencyService: CurrencyService,
    configService: ConfigService,
  ) {
    // Adres verilmezse servisin yerleşik ANAHTARSIZ sağlayıcıları kullanılır;
    // bu yüzden senkron artık .env'e bağlı değil, kendiliğinden çalışır.
    this.apiUrl = configService.get<string>('currency.apiUrl') || undefined;
    this.enabled = configService.get<boolean>('scheduler.enabled') ?? true;
  }

  /**
   * Açılışta bir kez çeker — yeni kurulumda kurlar boş kalmasın, kullanıcı
   * ilk dövizli fiyatı girdiğinde çevrim hazır olsun.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    await this.currencyService.syncFromApi(this.apiUrl);
  }

  @Cron(process.env.EXCHANGE_RATE_SYNC_CRON || '0 6 * * *')
  async handle(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    this.logger.log('Döviz kuru senkronizasyonu başladı.');
    await this.currencyService.syncFromApi(this.apiUrl);
  }
}
