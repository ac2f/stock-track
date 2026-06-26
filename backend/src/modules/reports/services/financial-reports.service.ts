import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  MoreThan,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';
import { roundMoney } from '../../../common/utils/area.util';
import { Customer } from '../../customers/entities/customer.entity';
import { CustomerLedgerEntry } from '../../customers/entities/customer-ledger-entry.entity';
import { ProcessingJob } from '../../processing/entities/processing-job.entity';
import { PurchaseOrder } from '../../purchases/entities/purchase-order.entity';
import { Sale } from '../../sales/entities/sale.entity';

export interface AgingBuckets {
  current: number; // 0–30 gün
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export interface CustomerAging extends AgingBuckets {
  customerId: string;
  customerName: string;
}

export interface ProfitLoss {
  from?: string;
  to?: string;
  processingRevenue: number;
  salesTurnover: number;
  salesMargin: number;
  purchaseCost: number;
  income: number; // işleme geliri + satış kârı
  expense: number; // alış maliyeti
  net: number;
}

@Injectable()
export class FinancialReportsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerRepo: Repository<CustomerLedgerEntry>,
    @InjectRepository(ProcessingJob)
    private readonly jobsRepo: Repository<ProcessingJob>,
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    @InjectRepository(PurchaseOrder)
    private readonly purchasesRepo: Repository<PurchaseOrder>,
  ) {}

  /**
   * Cari yaşlandırma — FIFO: alacaklar (CREDIT) en eski borçlara (DEBIT) mahsup
   * edilir; kalan borçlar yaşlarına göre kovalanır.
   */
  async aging(customerId?: string, asOf = new Date()): Promise<CustomerAging[]> {
    const customers = customerId
      ? await this.customersRepo.find({ where: { id: customerId } })
      : await this.customersRepo.find({ where: { currentBalance: MoreThan(0) } });

    const result: CustomerAging[] = [];
    for (const customer of customers) {
      const entries = await this.ledgerRepo.find({
        where: { customerId: customer.id },
        order: { occurredAt: 'ASC' },
      });

      // FIFO kuyruğu: açık borç kalemleri.
      const open: { remaining: number; date: Date }[] = [];
      for (const e of entries) {
        if (e.entryType === LedgerEntryType.DEBIT) {
          open.push({ remaining: Number(e.amount), date: e.occurredAt });
        } else {
          let credit = Number(e.amount);
          while (credit > 0 && open.length > 0) {
            const head = open[0];
            const applied = Math.min(head.remaining, credit);
            head.remaining -= applied;
            credit -= applied;
            if (head.remaining <= 0.000001) open.shift();
          }
        }
      }

      const buckets = this.bucketize(open, asOf);
      if (buckets.total > 0.009) {
        result.push({
          customerId: customer.id,
          customerName: customer.name,
          ...buckets,
        });
      }
    }
    return result.sort((a, b) => b.total - a.total);
  }

  async profitLoss(from?: Date, to?: Date): Promise<ProfitLoss> {
    const jobsQb = this.jobsRepo
      .createQueryBuilder('j')
      .select('COALESCE(SUM(j.base_total_cost), 0)', 'v')
      .where('j.is_billed = true');
    this.applyDateRange(jobsQb, 'j.processed_at', from, to);
    const processing = await jobsQb.getRawOne<{ v: string }>();

    const salesQb = this.salesRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.base_sale_total), 0)', 'turnover')
      .addSelect('COALESCE(SUM(s.base_sale_total - s.base_owner_amount), 0)', 'margin')
      .where('1 = 1');
    this.applyDateRange(salesQb, 's.sale_date', from, to);
    const sales = await salesQb.getRawOne<{ turnover: string; margin: string }>();

    const purchasesQb = this.purchasesRepo
      .createQueryBuilder('po')
      .select('COALESCE(SUM(po.total_amount), 0)', 'v')
      .where('1 = 1');
    this.applyDateRange(purchasesQb, 'po.purchase_date', from, to);
    const purchases = await purchasesQb.getRawOne<{ v: string }>();

    const processingRevenue = Number(processing?.v ?? 0);
    const salesTurnover = Number(sales?.turnover ?? 0);
    const salesMargin = Number(sales?.margin ?? 0);
    const purchaseCost = Number(purchases?.v ?? 0);
    const income = roundMoney(processingRevenue + salesMargin);
    const expense = roundMoney(purchaseCost);

    return {
      from: from?.toISOString(),
      to: to?.toISOString(),
      processingRevenue: roundMoney(processingRevenue),
      salesTurnover: roundMoney(salesTurnover),
      salesMargin: roundMoney(salesMargin),
      purchaseCost: expense,
      income,
      expense,
      net: roundMoney(income - expense),
    };
  }

  /** En borçlu müşteriler (pozitif bakiye). */
  topDebtors(limit = 10): Promise<Customer[]> {
    return this.customersRepo.find({
      where: { currentBalance: MoreThan(0) },
      order: { currentBalance: 'DESC' },
      take: limit,
    });
  }

  /** İşletmenin borçlu olduğu (negatif bakiye) müşteriler/sahipler. */
  async topCreditors(limit = 10): Promise<Customer[]> {
    return this.customersRepo
      .createQueryBuilder('c')
      .where('c.current_balance < 0')
      .orderBy('c.current_balance', 'ASC')
      .take(limit)
      .getMany();
  }

  private applyDateRange<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    col: string,
    from?: Date,
    to?: Date,
  ): void {
    if (from) qb.andWhere(`${col} >= :from`, { from });
    if (to) qb.andWhere(`${col} <= :to`, { to });
  }

  private bucketize(
    open: { remaining: number; date: Date }[],
    asOf: Date,
  ): AgingBuckets {
    const b: AgingBuckets = {
      current: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
      total: 0,
    };
    for (const item of open) {
      if (item.remaining <= 0) continue;
      const ageDays = Math.floor(
        (asOf.getTime() - item.date.getTime()) / 86_400_000,
      );
      if (ageDays <= 30) b.current += item.remaining;
      else if (ageDays <= 60) b.days31to60 += item.remaining;
      else if (ageDays <= 90) b.days61to90 += item.remaining;
      else b.over90 += item.remaining;
    }
    b.current = roundMoney(b.current);
    b.days31to60 = roundMoney(b.days31to60);
    b.days61to90 = roundMoney(b.days61to90);
    b.over90 = roundMoney(b.over90);
    b.total = roundMoney(b.current + b.days31to60 + b.days61to90 + b.over90);
    return b;
  }
}
