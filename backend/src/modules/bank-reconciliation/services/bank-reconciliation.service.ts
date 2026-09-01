import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Payment } from '../../customers/entities/payment.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import {
  BankTransaction,
  BankTxMatchType,
  BankTxStatus,
} from '../entities/bank-transaction.entity';
import {
  DATE_WINDOW_DAYS,
  MIN_SCORE,
  scoreCandidate,
} from './match-score.util';
import {
  ColumnMapping,
  fingerprintOf,
  parseCsv,
  parseRow,
} from './statement-parser.util';

export interface ImportResult {
  batchId: string;
  /** Dosyadaki satır sayısı. */
  rows: number;
  /** Kaydedilen yeni hareket sayısı. */
  imported: number;
  /** Daha önce yüklendiği için atlanan hareket sayısı. */
  duplicates: number;
  /** Tarihi/tutarı çözülemediği için atlanan satır sayısı. */
  skipped: number;
}

/** Bir banka hareketi için önerilen eşleşme. */
export interface MatchSuggestion {
  type: BankTxMatchType;
  id: string;
  label: string;
  date: string;
  amount: number;
  score: number;
  reasons: string[];
}

/**
 * Banka mutabakatı.
 *
 * Bankadan gelen hareketleri uygulamadaki tahsilat/ödeme ve gider kayıtlarıyla
 * eşleştirir. Eşleştirme ASLA kendiliğinden onaylanmaz — servis yalnızca aday
 * önerir, kararı kullanıcı verir. Böylece yanlış bir otomatik eşleşme cari
 * bakiyeyi sessizce bozamaz.
 *
 * Veri kaynağı bilinçli olarak soyutlanmıştır: bugün ekstre dosyası yüklenir,
 * yarın banka API'si bağlandığında yalnızca `importRows` çağıran katman değişir.
 */
@Injectable()
export class BankReconciliationService {
  private readonly logger = new Logger(BankReconciliationService.name);

  constructor(
    @InjectRepository(BankTransaction)
    private readonly txRepo: Repository<BankTransaction>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
  ) {}

  // ── İçe aktarma ─────────────────────────────────────────────────────

  /** CSV metnini ayrıştırıp içe aktarır. */
  async importCsv(
    bankAccountId: string,
    csv: string,
    mapping: ColumnMapping,
    currency = 'TRY',
  ): Promise<ImportResult> {
    const rows = parseCsv(csv);
    if (!rows.length) {
      throw new BadRequestException('Dosyada okunabilir satır bulunamadı.');
    }
    return this.importRows(bankAccountId, rows, mapping, currency);
  }

  /**
   * Ham satırları içe aktarır — kaynak fark etmez (dosya ya da API).
   * Aynı hareket iki kez yüklenirse `fingerprint` sayesinde atlanır.
   */
  async importRows(
    bankAccountId: string,
    rows: Record<string, unknown>[],
    mapping: ColumnMapping,
    currency = 'TRY',
  ): Promise<ImportResult> {
    const batchId = randomUUID();
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const raw of rows) {
      const parsed = parseRow(raw, mapping);
      if (!parsed) {
        skipped += 1;
        continue;
      }
      const fingerprint = fingerprintOf(parsed);
      const exists = await this.txRepo.findOne({
        where: { bankAccountId, fingerprint },
      });
      if (exists) {
        duplicates += 1;
        continue;
      }
      await this.txRepo.save(
        this.txRepo.create({
          bankAccountId,
          fingerprint,
          externalId: parsed.externalId,
          transactionDate: parsed.transactionDate,
          amount: parsed.amount,
          currency: currency.toUpperCase(),
          description: parsed.description,
          counterpartyName: parsed.counterpartyName,
          counterpartyIban: parsed.counterpartyIban,
          balanceAfter: parsed.balanceAfter ?? null,
          status: BankTxStatus.UNMATCHED,
          rawRow: raw,
          importBatchId: batchId,
        }),
      );
      imported += 1;
    }

    this.logger.log(
      `Ekstre içe aktarıldı: ${imported} yeni, ${duplicates} mükerrer, ${skipped} atlandı.`,
    );
    return { batchId, rows: rows.length, imported, duplicates, skipped };
  }

  // ── Listeleme ───────────────────────────────────────────────────────

  async list(filters: {
    bankAccountId?: string;
    status?: BankTxStatus;
    from?: string;
    to?: string;
  }): Promise<BankTransaction[]> {
    const qb = this.txRepo
      .createQueryBuilder('t')
      .orderBy('t.transaction_date', 'DESC')
      .addOrderBy('t.created_at', 'DESC')
      .take(300);
    if (filters.bankAccountId) {
      qb.andWhere('t.bank_account_id = :id', { id: filters.bankAccountId });
    }
    if (filters.status) qb.andWhere('t.status = :s', { s: filters.status });
    if (filters.from) qb.andWhere('t.transaction_date >= :f', { f: filters.from });
    if (filters.to) qb.andWhere('t.transaction_date <= :t2', { t2: filters.to });
    return qb.getMany();
  }

  /** Mutabakat özeti — kaç hareket bekliyor, ne kadar tutuyor. */
  async summary(bankAccountId?: string): Promise<{
    unmatched: number;
    matched: number;
    ignored: number;
    unmatchedIncoming: number;
    unmatchedOutgoing: number;
  }> {
    const all = await this.list({ bankAccountId });
    const unmatchedRows = all.filter((t) => t.status === BankTxStatus.UNMATCHED);
    const sum = (rows: BankTransaction[]) =>
      Math.round(rows.reduce((n, t) => n + Number(t.amount), 0) * 100) / 100;
    return {
      unmatched: unmatchedRows.length,
      matched: all.filter((t) => t.status === BankTxStatus.MATCHED).length,
      ignored: all.filter((t) => t.status === BankTxStatus.IGNORED).length,
      unmatchedIncoming: sum(unmatchedRows.filter((t) => Number(t.amount) > 0)),
      unmatchedOutgoing: sum(unmatchedRows.filter((t) => Number(t.amount) < 0)),
    };
  }

  // ── Eşleştirme ──────────────────────────────────────────────────────

  /**
   * Bir hareket için aday kayıtları puanlayıp döner.
   * Para GİRİŞİ ise tahsilatlar, ÇIKIŞI ise giderler ve sahibe ödemeler aranır.
   */
  async suggestions(txId: string): Promise<MatchSuggestion[]> {
    const tx = await this.findOne(txId);
    const incoming = Number(tx.amount) > 0;
    const window = this.dateWindow(tx.transactionDate);
    const text = `${tx.description} ${tx.counterpartyName ?? ''}`;

    const out: MatchSuggestion[] = [];

    // Ödemeler: giriş → tahsilat (incoming), çıkış → sahibe ödeme (outgoing).
    const payments = await this.paymentsRepo.find({
      where: { paymentDate: Between(window.from, window.to) },
      relations: { customer: true },
      take: 300,
    });
    const usedPaymentIds = await this.alreadyMatchedIds(BankTxMatchType.PAYMENT);
    for (const p of payments) {
      if (usedPaymentIds.has(p.id)) continue;
      // Yön uyuşmalı: banka girişi ↔ tahsilat, banka çıkışı ↔ sahibe ödeme.
      if (incoming !== (p.direction === 'incoming')) continue;
      const scored = scoreCandidate({
        txAmount: Number(tx.amount),
        txDate: tx.transactionDate,
        txText: text,
        candidateAmount: Number(p.baseAmount ?? p.amount),
        candidateDate: p.paymentDate,
        candidateName: p.customer?.name,
        candidateReference: p.referenceNo,
      });
      if (scored && scored.score >= MIN_SCORE) {
        out.push({
          type: BankTxMatchType.PAYMENT,
          id: p.id,
          label: `${p.customer?.name ?? 'Müşteri'} · ${
            p.direction === 'incoming' ? 'tahsilat' : 'ödeme'
          }`,
          date: new Date(p.paymentDate).toISOString().slice(0, 10),
          amount: Number(p.amount),
          score: scored.score,
          reasons: scored.reasons,
        });
      }
    }

    // Giderler yalnızca para ÇIKIŞLARIYLA eşleşir.
    if (!incoming) {
      const expenses = await this.expensesRepo.find({
        where: { expenseDate: Between(window.from, window.to) as never },
        relations: { category: true, project: true },
        take: 300,
      });
      const usedExpenseIds = await this.alreadyMatchedIds(BankTxMatchType.EXPENSE);
      for (const e of expenses) {
        if (usedExpenseIds.has(e.id)) continue;
        const scored = scoreCandidate({
          txAmount: Number(tx.amount),
          txDate: tx.transactionDate,
          txText: text,
          candidateAmount: Number(e.amount),
          candidateDate: e.expenseDate,
          candidateName: e.category?.name,
          candidateReference: e.description,
        });
        if (scored && scored.score >= MIN_SCORE) {
          out.push({
            type: BankTxMatchType.EXPENSE,
            id: e.id,
            label: `${e.category?.name ?? 'Gider'}${
              e.description ? ` · ${e.description}` : ''
            }`,
            date: String(e.expenseDate).slice(0, 10),
            amount: Number(e.amount),
            score: scored.score,
            reasons: scored.reasons,
          });
        }
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /** Kullanıcının onayıyla eşleştirir. */
  async confirm(
    txId: string,
    type: BankTxMatchType,
    matchId: string,
    userId?: string,
  ): Promise<BankTransaction> {
    const tx = await this.findOne(txId);
    // Aynı kaydın iki banka hareketine bağlanmasını engelle.
    const clash = await this.txRepo.findOne({
      where: { matchType: type, matchId, status: BankTxStatus.MATCHED },
    });
    if (clash && clash.id !== txId) {
      throw new BadRequestException(
        'Bu kayıt zaten başka bir banka hareketiyle eşleştirilmiş.',
      );
    }
    tx.status = BankTxStatus.MATCHED;
    tx.matchType = type;
    tx.matchId = matchId;
    tx.matchedById = userId ?? null;
    tx.matchedAt = new Date();
    return this.txRepo.save(tx);
  }

  /** Eşleştirmeyi geri alır — hareket yeniden kuyruğa döner. */
  async unmatch(txId: string): Promise<BankTransaction> {
    const tx = await this.findOne(txId);
    tx.status = BankTxStatus.UNMATCHED;
    tx.matchType = null;
    tx.matchId = null;
    tx.matchedById = null;
    tx.matchedAt = null;
    return this.txRepo.save(tx);
  }

  /** Hareketi mutabakat dışında bırakır (ör. hesaplar arası virman). */
  async ignore(txId: string): Promise<BankTransaction> {
    const tx = await this.findOne(txId);
    tx.status = BankTxStatus.IGNORED;
    tx.matchType = null;
    tx.matchId = null;
    return this.txRepo.save(tx);
  }

  async findOne(id: string): Promise<BankTransaction> {
    const tx = await this.txRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('Banka hareketi bulunamadı.');
    return tx;
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────

  /** Zaten bir banka hareketine bağlanmış kayıt kimlikleri. */
  private async alreadyMatchedIds(
    type: BankTxMatchType,
  ): Promise<Set<string>> {
    const rows = await this.txRepo.find({
      where: { matchType: type, status: BankTxStatus.MATCHED },
      select: { matchId: true },
    });
    return new Set(rows.map((r) => r.matchId).filter((v): v is string => !!v));
  }

  /** Aday aramasının tarih aralığı. */
  private dateWindow(date: string): { from: Date; to: Date } {
    const center = new Date(date);
    const from = new Date(center);
    from.setDate(from.getDate() - DATE_WINDOW_DAYS);
    const to = new Date(center);
    to.setDate(to.getDate() + DATE_WINDOW_DAYS);
    return { from, to };
  }
}
