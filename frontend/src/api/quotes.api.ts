import { api } from './client';
import type { Paginated, Quote, QuoteItemInput, QuoteStatus } from '../types';

export interface QuoteFilters {
  buyerCustomerId?: string;
  status?: QuoteStatus;
  plateId?: string;
  categoryId?: string; // malzeme türü (pleksi, alüminyum kompozit…)
  from?: string; // ISO tarih (YYYY-MM-DD)
  to?: string;
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

export interface CreateQuoteInput {
  buyerCustomerId: string;
  ownerCustomerId?: string;
  currency?: string;
  note?: string;
  validUntil?: string;
  items: QuoteItemInput[];
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const { data } = await api.post<Quote>('/quotes', input);
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
): Promise<{ saleId?: string; processingJobIds: string[] }> {
  const { data } = await api.post<{
    saleId?: string;
    processingJobIds: string[];
  }>(`/quotes/${id}/convert`);
  return data;
}

/**
 * Teklifi sil: teklife ait tüm kuyruk (işleme) işlerini ve (dönüştürülmüşse)
 * satışı geri alır → ilgili borçlar cari ekstreden düşer.
 */
export async function deleteQuote(id: string): Promise<void> {
  await api.delete(`/quotes/${id}`);
}
