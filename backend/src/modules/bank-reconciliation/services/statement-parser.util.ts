import { createHash } from 'node:crypto';

/**
 * Banka ekstresi içe aktarma yardımcıları.
 *
 * Her bankanın ekstresi farklı sütun adları ve sayı/tarih biçimleri kullanır.
 * Bu yüzden ayrıştırma BANKAYA ÖZEL DEĞİLDİR: kullanıcı sütunları bir kez
 * eşler, kalanını buradaki dönüştürücüler halleder. Albaraka, Ziraat ya da
 * başka bir banka fark etmez.
 */

/** Ekstre sütunlarının uygulamadaki alanlara eşlemesi. */
export interface ColumnMapping {
  date: string;
  /** Tek sütunda işaretli tutar. */
  amount?: string;
  /** Ya da ayrı borç/alacak sütunları (banka ekstrelerinde yaygın). */
  debit?: string;
  credit?: string;
  description?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  externalId?: string;
  balanceAfter?: string;
}

export interface ParsedRow {
  transactionDate: string;
  amount: number;
  description: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  externalId?: string;
  balanceAfter?: number | null;
  raw: Record<string, unknown>;
}

/**
 * Türkçe biçimli sayıyı çözer: "1.234,56" → 1234.56, "(500,00)" → -500,
 * "1,234.56" (İngilizce biçim) → 1234.56.
 *
 * Ayraç belirsizliği son ayraca bakılarak çözülür: en sağdaki nokta/virgül
 * ondalık ayracıdır.
 */
export function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text) return null;

  // Muhasebe biçimi: parantez içi = negatif.
  let negative = /^\(.*\)$/.test(text);
  if (negative) text = text.slice(1, -1);
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }

  // Para birimi simgeleri ve boşlukları at.
  text = text.replace(/[^\d.,]/g, '');
  if (!text) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);
  if (decimalAt >= 0) {
    const decimals = text.length - decimalAt - 1;
    // 3 haneli "ondalık" aslında binlik ayracıdır (1.234) → ondalık yok say.
    if (decimals > 0 && decimals <= 2) {
      const intPart = text.slice(0, decimalAt).replace(/[.,]/g, '');
      const fracPart = text.slice(decimalAt + 1);
      text = `${intPart}.${fracPart}`;
    } else {
      text = text.replace(/[.,]/g, '');
    }
  }

  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Tarihi ISO (YYYY-MM-DD) biçimine çevirir.
 * Desteklenen: 10.03.2026 · 10/03/2026 · 2026-03-10 · Excel seri numarası.
 * GÜN.AY.YIL varsayılır (Türkiye) — belirsizlikte ay/gün karışmasın diye
 * ay > 12 ise sıra çevrilir.
 */
export function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null;

  // Excel tarih seri numarası (1899-12-30 başlangıçlı).
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const ms = Math.round((value - 25569) * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (Number(m) > 12 && Number(d) <= 12) [d, m] = [m, d];
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/**
 * Aynı hareketin iki kez yüklenmesini engelleyen iz.
 * Banka bir referans numarası veriyorsa o yeterlidir; vermiyorsa tarih + tutar
 * + açıklamadan türetilir.
 */
export function fingerprintOf(row: {
  externalId?: string;
  transactionDate: string;
  amount: number;
  description: string;
}): string {
  if (row.externalId?.trim()) return `ref:${row.externalId.trim()}`;
  const basis = [
    row.transactionDate,
    row.amount.toFixed(2),
    row.description.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr'),
  ].join('|');
  return `sig:${createHash('sha256').update(basis).digest('hex').slice(0, 32)}`;
}

/** Ekstre satırını eşlemeye göre çözer; çözülemeyen satır null döner. */
export function parseRow(
  raw: Record<string, unknown>,
  mapping: ColumnMapping,
): ParsedRow | null {
  const transactionDate = parseDate(raw[mapping.date]);
  if (!transactionDate) return null;

  // Tutar: tek işaretli sütun ya da ayrı borç/alacak sütunları.
  let amount: number | null = null;
  if (mapping.amount) {
    amount = parseAmount(raw[mapping.amount]);
  } else {
    const credit = mapping.credit ? parseAmount(raw[mapping.credit]) : null;
    const debit = mapping.debit ? parseAmount(raw[mapping.debit]) : null;
    // Giriş pozitif, çıkış negatif. Banka borç sütununu pozitif yazar.
    if (credit) amount = Math.abs(credit);
    else if (debit) amount = -Math.abs(debit);
  }
  if (amount == null || amount === 0) return null;

  const description = String(
    mapping.description ? (raw[mapping.description] ?? '') : '',
  ).trim();

  const parsed: ParsedRow = {
    transactionDate,
    amount,
    description,
    counterpartyName: mapping.counterpartyName
      ? String(raw[mapping.counterpartyName] ?? '').trim() || undefined
      : undefined,
    counterpartyIban: mapping.counterpartyIban
      ? String(raw[mapping.counterpartyIban] ?? '').trim() || undefined
      : undefined,
    externalId: mapping.externalId
      ? String(raw[mapping.externalId] ?? '').trim() || undefined
      : undefined,
    balanceAfter: mapping.balanceAfter
      ? parseAmount(raw[mapping.balanceAfter])
      : null,
    raw,
  };
  return parsed;
}

/**
 * CSV metnini satır nesnelerine çevirir. Ayraç (`;` ya da `,`) başlık
 * satırından sezilir — Türkçe Excel çıktıları genelde noktalı virgül kullanır.
 * Tırnak içindeki ayraçlar korunur.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >=
    (lines[0].match(/,/g)?.length ?? 0)
    ? ';'
    : ',';

  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const headers = split(lines[0]).map((h, i) => h || `Sütun ${i + 1}`);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}
