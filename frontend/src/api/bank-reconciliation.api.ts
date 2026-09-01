import { api } from './client';

/** Banka hareketinin mutabakat durumu. */
export type BankTxStatus = 'unmatched' | 'matched' | 'ignored';
export type BankTxMatchType = 'payment' | 'expense';

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  bankAccount?: { bankName: string; iban?: string };
  externalId?: string;
  transactionDate: string;
  /** POZİTİF = hesaba giriş, NEGATİF = çıkış. */
  amount: number;
  currency: string;
  description: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  balanceAfter?: number | null;
  status: BankTxStatus;
  matchType?: BankTxMatchType | null;
  matchId?: string | null;
  matchedAt?: string | null;
}

/** Ekstre sütunlarının uygulamadaki alanlara eşlemesi. */
export interface ColumnMapping {
  date: string;
  amount?: string;
  debit?: string;
  credit?: string;
  description?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  externalId?: string;
  balanceAfter?: string;
}

export interface ImportResult {
  batchId: string;
  rows: number;
  imported: number;
  duplicates: number;
  skipped: number;
}

export async function importStatement(input: {
  bankAccountId: string;
  csv: string;
  mapping: ColumnMapping;
  currency?: string;
}): Promise<ImportResult> {
  const { data } = await api.post<ImportResult>(
    '/bank-reconciliation/import',
    input,
  );
  return data;
}

export async function fetchBankTransactions(filters: {
  bankAccountId?: string;
  status?: BankTxStatus;
  from?: string;
  to?: string;
}): Promise<BankTransaction[]> {
  const { data } = await api.get<BankTransaction[]>('/bank-reconciliation', {
    params: filters,
  });
  return data;
}

export interface ReconciliationSummary {
  unmatched: number;
  matched: number;
  ignored: number;
  unmatchedIncoming: number;
  unmatchedOutgoing: number;
}

export async function fetchReconciliationSummary(
  bankAccountId?: string,
): Promise<ReconciliationSummary> {
  const { data } = await api.get<ReconciliationSummary>(
    '/bank-reconciliation/summary',
    { params: bankAccountId ? { bankAccountId } : undefined },
  );
  return data;
}

/** Bir hareket için puanlanmış eşleşme adayları. */
export interface MatchSuggestion {
  type: BankTxMatchType;
  id: string;
  label: string;
  date: string;
  amount: number;
  /** 0–100; yüksek olan daha güçlü aday. */
  score: number;
  reasons: string[];
}

export async function fetchMatchSuggestions(
  txId: string,
): Promise<MatchSuggestion[]> {
  const { data } = await api.get<MatchSuggestion[]>(
    `/bank-reconciliation/${txId}/suggestions`,
  );
  return data;
}

export async function confirmMatch(
  txId: string,
  type: BankTxMatchType,
  matchId: string,
): Promise<BankTransaction> {
  const { data } = await api.post<BankTransaction>(
    `/bank-reconciliation/${txId}/match`,
    { type, matchId },
  );
  return data;
}

export async function unmatchTransaction(txId: string): Promise<BankTransaction> {
  const { data } = await api.post<BankTransaction>(
    `/bank-reconciliation/${txId}/unmatch`,
  );
  return data;
}

export async function ignoreTransaction(txId: string): Promise<BankTransaction> {
  const { data } = await api.post<BankTransaction>(
    `/bank-reconciliation/${txId}/ignore`,
  );
  return data;
}

/**
 * CSV başlık satırını okur — sütun eşleme ekranı için.
 * Ayraç (`;` / `,`) başlıktan sezilir; Türkçe Excel çıktıları noktalı virgül
 * kullanır.
 */
export function readCsvHeaders(csv: string): string[] {
  const first = csv.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim());
  if (!first) return [];
  const delimiter =
    (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0)
      ? ';'
      : ',';
  return first
    .split(delimiter)
    .map((h, i) => h.replace(/^"|"$/g, '').trim() || `Sütun ${i + 1}`);
}

/**
 * Başlık adlarından sütunları tahmin eder — kullanıcı çoğu ekstrede hiçbir şey
 * seçmek zorunda kalmasın diye. Tahmin yanlışsa ekranda düzeltilebilir.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const find = (...needles: string[]) =>
    headers.find((h) => {
      const t = h.toLocaleLowerCase('tr');
      return needles.some((n) => t.includes(n));
    });

  return {
    date: find('tarih', 'date') ?? headers[0] ?? '',
    amount: find('işlem tutar', 'tutar', 'amount', 'miktar'),
    debit: find('borç', 'çıkan', 'gider', 'debit'),
    credit: find('alacak', 'giren', 'gelen', 'credit'),
    description: find('açıklama', 'description', 'detay', 'işlem'),
    counterpartyName: find('karşı', 'gönderen', 'alıcı', 'ünvan', 'isim', 'ad soyad'),
    counterpartyIban: find('iban'),
    externalId: find('dekont', 'referans', 'fiş', 'sıra', 'işlem no'),
    balanceAfter: find('bakiye', 'balance'),
  };
}
