import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { roundMoney } from '../../common/utils/area.util';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';

export interface ConversionResult {
  amount: number; // hedef para birimindeki tutar
  rate: number; // uygulanan kur (from→to)
  from: string;
  to: string;
}

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  readonly baseCurrency: string;

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly ratesRepo: Repository<ExchangeRate>,
    configService: ConfigService,
  ) {
    this.baseCurrency =
      configService.get<string>('currency.base') ??
      configService.get<string>('business.defaultCurrency') ??
      'TRY';
  }

  /** Manuel kur girişi/güncelleme. */
  upsert(dto: CreateExchangeRateDto, source = 'manual'): Promise<ExchangeRate> {
    const rate = this.ratesRepo.create({
      baseCurrency: (dto.baseCurrency ?? this.baseCurrency).toUpperCase(),
      quoteCurrency: dto.quoteCurrency.toUpperCase(),
      rate: dto.rate,
      asOf: dto.asOf ? new Date(dto.asOf) : new Date(),
      source,
    });
    return this.ratesRepo.save(rate);
  }

  list(): Promise<ExchangeRate[]> {
    return this.ratesRepo.find({ order: { asOf: 'DESC' } });
  }

  /**
   * `amount`'u `from` → `to` çevirir. Kurlar baz para birimine göre tutulur:
   * baseUnitsPer(X) = 1 X kaç baz birim eder. amountBase = amount × baseUnitsPer(from),
   * sonuç = amountBase / baseUnitsPer(to).
   */
  async convert(
    amount: number,
    from: string,
    to: string,
    atDate?: Date,
  ): Promise<ConversionResult> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) {
      return { amount: roundMoney(amount), rate: 1, from: f, to: t };
    }
    const [basePerFrom, basePerTo] = await Promise.all([
      this.baseUnitsPer(f, atDate),
      this.baseUnitsPer(t, atDate),
    ]);
    const rate = basePerFrom / basePerTo;
    return {
      amount: roundMoney(amount * rate),
      rate,
      from: f,
      to: t,
    };
  }

  /** Kısa yol: tutarı sistem baz para birimine çevirir, yalnızca sayı döner. */
  async toBase(amount: number, from: string, atDate?: Date): Promise<number> {
    const { amount: converted } = await this.convert(
      amount,
      from,
      this.baseCurrency,
      atDate,
    );
    return converted;
  }

  /** 1 birim `currency` kaç baz para birimi eder. */
  private async baseUnitsPer(currency: string, atDate?: Date): Promise<number> {
    if (currency === this.baseCurrency.toUpperCase()) {
      return 1;
    }
    const rate = await this.ratesRepo.findOne({
      where: {
        baseCurrency: this.baseCurrency.toUpperCase(),
        quoteCurrency: currency,
        ...(atDate ? { asOf: LessThanOrEqual(atDate) } : {}),
      },
      order: { asOf: 'DESC' },
    });
    if (!rate) {
      throw new BadRequestException(
        `${this.baseCurrency}/${currency} için tanımlı bir döviz kuru bulunamadı.`,
      );
    }
    return Number(rate.rate);
  }

  /**
   * Harici API'den kur çeker (config-gated). Beklenen yanıt:
   * { base: 'TRY', rates: { USD: 0.031, EUR: 0.029 } } (1 base = rates[X] X eder)
   * → base-per-quote = 1 / rates[X] olarak saklanır. Ağ/erişim yoksa sessizce atlar.
   */
  async syncFromApi(apiUrl: string): Promise<number> {
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        this.logger.warn(`Kur API yanıtı başarısız: ${res.status}`);
        return 0;
      }
      const data = (await res.json()) as {
        base?: string;
        rates?: Record<string, number>;
      };
      const rates = data.rates ?? {};
      let count = 0;
      for (const [quote, perBase] of Object.entries(rates)) {
        if (!perBase || quote === this.baseCurrency) continue;
        await this.upsert(
          { quoteCurrency: quote, rate: roundMoney(1 / perBase) },
          'api',
        );
        count += 1;
      }
      this.logger.log(`${count} döviz kuru API'den güncellendi.`);
      return count;
    } catch (err) {
      this.logger.warn(`Kur senkronizasyonu atlandı: ${(err as Error).message}`);
      return 0;
    }
  }
}
