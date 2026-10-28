import { api } from './client';
import type { Paginated, Quote, QuoteItemInput, QuoteStatus } from '../types';

export interface QuoteFilters {
  buyerCustomerId?: string;
  status?: QuoteStatus;
  plateId?: string;
  categoryId?: string; // malzeme türü (pleksi, alüminyum kompozit…)
  from?: string; // ISO tarih (YYYY-MM-DD)
  to?: string;
  /** Teklif no ya da müşteri adı. */
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchQuotes(
  filters: QuoteFilters,
): Promise<Paginated<Quote>> {
  const { data } = await api.get<Paginated<Quote>>('/quotes', {
    params: filters,
  });
  return data;
}

/**
 * Tek teklif, kalemlerin malzeme ayrıntılarıyla (liste yanıtı hafiftir:
 * kalemlerin plaka/şablon bilgisi yoktur). Düzenleme formu bunu kullanır.
 */
export async function fetchQuote(id: string): Promise<Quote> {
  const { data } = await api.get<Quote>(`/quotes/${id}`);
  return data;
}

export interface CreateQuoteInput {
  buyerCustomerId: string;
  ownerCustomerId?: string;
  currency?: string;
  note?: string;
  validUntil?: string;
  /** Teklif tarihi (geriye dönük giriş), YYYY-MM-DD. */
  quoteDate?: string;
  /** Runner bu teklif için kendiliğinden klasör açmasın. */
  skipFolders?: boolean;
  /**
   * Kaydederken tek adımda ilerlet: 'convert' kabul + satış/işlemeye dönüştür,
   * 'complete' bunlara ek olarak işlemeleri kalem tarihleriyle tamamla.
   */
  finalize?: 'convert' | 'complete';
  items: QuoteItemInput[];
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const { data } = await api.post<Quote>('/quotes', input);
  return data;
}

/** #8 Onaylanmamış (taslak/gönderildi/red) teklifi tümüyle yeniden yazar. */
export async function updateQuote(
  id: string,
  input: CreateQuoteInput,
): Promise<Quote> {
  const { data } = await api.patch<Quote>(`/quotes/${id}`, input);
  return data;
}

export async function setQuoteStatus(
  id: string,
  status: QuoteStatus,
): Promise<Quote> {
  const { data } = await api.patch<Quote>(`/quotes/${id}/status`, { status });
  return data;
}

export async function convertQuote(
  id: string,
  opts: { completeProcessing?: boolean } = {},
): Promise<{ saleId?: string; processingJobIds: string[] }> {
  const { data } = await api.post<{
    saleId?: string;
    processingJobIds: string[];
  }>(`/quotes/${id}/convert`, {
    completeProcessing: opts.completeProcessing ?? false,
  });
  return data;
}

/**
 * Teklifi sil: teklife ait tüm kuyruk (işleme) işlerini ve (dönüştürülmüşse)
 * satışı geri alır → ilgili borçlar cari ekstreden düşer.
 */
/** İşe dönüşmüş teklifin klasörlerini dükkân bilgisayarından yeniden ister. */
export async function requestQuoteFolders(id: string): Promise<Quote> {
  const { data } = await api.post<Quote>(`/quotes/${id}/request-folders`);
  return data;
}

export async function deleteQuote(id: string): Promise<void> {
  await api.delete(`/quotes/${id}`);
}
