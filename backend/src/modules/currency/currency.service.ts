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
   * Kur sağlayıcıları — ANAHTAR GEREKTİRMEZ, kayıt istemez.
   *
   *  1) open.er-api.com — exchangerate-api'nin ücretsiz uçları; her para
   *     birimini taban alabilir, günlük güncellenir.
   *  2) frankfurter.app — Avrupa Merkez Bankası verisi (yedek).
   *
   * `{BASE}` yerine sistemin baz para birimi yazılır. Sıradaki adres yalnızca
   * bir öncekine ulaşılamazsa denenir.
   */
  static readonly DEFAULT_API_URLS = [
    'https://open.er-api.com/v6/latest/{BASE}',
    'https://api.frankfurter.app/latest?from={BASE}',
  ];

  /**
   * Harici API'den kur çeker. Birden çok adres virgülle verilebilir; ilki
   * başarısız olursa sıradaki denenir. Adres verilmezse yerleşik açık
   * sağlayıcılar kullanılır.
   *
   * Beklenen yanıt (her iki sağlayıcı da bunu verir):
   *   { base|base_code: 'TRY', rates: { USD: 0.031, EUR: 0.029 } }
   * Yani 1 baz birim = rates[X] adet X. Veritabanında bunun TERSİ saklanır
   * (1 X kaç baz birim eder) — çevrim hep "1 döviz = N TL" yönünde okunur.
   *
   * Ağ/erişim yoksa sessizce 0 döner; iş akışını bozmaz.
   */
  async syncFromApi(apiUrl?: string): Promise<number> {
    const urls = (apiUrl ? apiUrl.split(',') : CurrencyService.DEFAULT_API_URLS)
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) => u.replace(/\{BASE\}/g, this.baseCurrency.toUpperCase()));

    for (const url of urls) {
      const count = await this.syncFromSingle(url);
      if (count > 0) return count;
    }
    this.logger.warn('Hiçbir kur sağlayıcısından veri alınamadı.');
    return 0;
  }

  /** Tek bir adresten kurları çeker; başarısızlıkta 0 döner (hata fırlatmaz). */
  private async syncFromSingle(url: string): Promise<number> {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.warn(`Kur API yanıtı başarısız (${url}): ${res.status}`);
        return 0;
      }
      const data = (await res.json()) as {
        base?: string;
        base_code?: string;
        result?: string;
        rates?: Record<string, number>;
      };
      if (data.result && data.result !== 'success') {
        this.logger.warn(`Kur API hata bildirdi (${url}): ${data.result}`);
        return 0;
      }

      const base = (data.base ?? data.base_code ?? this.baseCurrency).toUpperCase();
      if (base !== this.baseCurrency.toUpperCase()) {
        // Sağlayıcı başka bir tabanla döndüyse ters çevrim yanlış olurdu.
        this.logger.warn(
          `Kur API beklenen tabanı vermedi (${url}): ${base} ≠ ${this.baseCurrency}`,
        );
        return 0;
      }

      const rates = data.rates ?? {};
      let count = 0;
      for (const [quote, perBase] of Object.entries(rates)) {
        if (!perBase || perBase <= 0) continue;
        if (quote.toUpperCase() === this.baseCurrency.toUpperCase()) continue;
        await this.upsert(
          {
            quoteCurrency: quote.toUpperCase(),
            // 1 quote kaç baz birim eder. Kolon 6 haneli ondalık tutar; küçük
            // kurlarda (ör. JPY) hassasiyet kaybolmasın diye roundMoney (2 hane)
            // yerine 6 haneye yuvarlanır.
            rate: Math.round((1 / perBase) * 1e6) / 1e6,
          },
          'api',
        );
        count += 1;
      }
      this.logger.log(`${count} döviz kuru güncellendi (${url}).`);
      return count;
    } catch (err) {
      this.logger.warn(
        `Kur senkronizasyonu atlandı (${url}): ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Arayüzde sürekli gösterilen kurlar (varsayılan USD ve EUR).
   * Kur yoksa `rate: null` döner — ekran "—" gösterir, hata vermez.
   */
  async ticker(
    quotes: string[] = ['USD', 'EUR'],
  ): Promise<{
    baseCurrency: string;
    rates: {
      currency: string;
      rate: number | null;
      asOf: string | null;
      source: string | null;
    }[];
  }> {
    const rows = await Promise.all(
      quotes.map(async (currency) => {
        const row = await this.ratesRepo.findOne({
          where: {
            baseCurrency: this.baseCurrency.toUpperCase(),
            quoteCurrency: currency.toUpperCase(),
          },
          order: { asOf: 'DESC' },
        });
        return {
          currency: currency.toUpperCase(),
          rate: row ? Number(row.rate) : null,
          asOf: row ? new Date(row.asOf).toISOString() : null,
          source: row?.source ?? null,
        };
      }),
    );
    return { baseCurrency: this.baseCurrency.toUpperCase(), rates: rows };
  }
}
