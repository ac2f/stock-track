import { api } from './client';

/** Arayüz üst şeridinde gösterilen tek bir kur. */
export interface TickerRate {
  currency: string;
  /** 1 birim döviz kaç baz para birimi eder; tanımlı değilse null. */
  rate: number | null;
  /** Kurun geçerli olduğu an (ISO); yoksa null. */
  asOf: string | null;
  /** 'api' (webden çekildi) veya 'manual' (elle girildi). */
  source: string | null;
}

export interface CurrencyTicker {
  baseCurrency: string;
  rates: TickerRate[];
}

/** Sürekli gösterilecek kurlar (varsayılan USD, EUR). */
export async function fetchCurrencyTicker(
  quotes?: string[],
): Promise<CurrencyTicker> {
  const { data } = await api.get<CurrencyTicker>('/exchange-rates/ticker', {
    params: quotes?.length ? { quotes: quotes.join(',') } : undefined,
  });
  return data;
}

/** Kurları webden şimdi çeker (zamanlanmışı beklemeden). */
export async function syncCurrencyRates(): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>('/exchange-rates/sync');
  return data;
}
