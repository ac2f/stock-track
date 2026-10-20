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
import { ShopContext } from '../../../common/shop/shop-context';
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
   *
   * Tek sorgu: her müşterinin toplam alacağı, borç kalemlerinin tarih sırasıyla
   * birikimli toplamından düşülür; birikimli toplamı alacağı aşan kalemler
   * (aşan kadarıyla) açıktır. Bu, hareketleri tek tek dolaşan FIFO ile aynıdır
   * — tek fark: borçtan ÖNCE gelen alacak (avans) da sonraki borçlara mahsup
   * edilir (eskiden boşa düşüyor, yaşlandırma toplamı bakiyeyi aşabiliyordu).
   * Ham SQL dükkân süzgecinden geçmez; koşul elle yazılır.
   */
  async aging(customerId?: string, asOf = new Date()): Promise<CustomerAging[]> {
    const params: unknown[] = [ShopContext.requireShopId()];
    let customerCond = 'c.current_balance > 0';
    if (customerId) {
      params.push(customerId);
      customerCond = 'c.id = $2';
    }
    const rows: {
      customer_id: string;
      customer_name: string;
      occurred_at: Date | string;
      remaining: string;
    }[] = await this.ledgerRepo.query(
      `WITH cust AS (
         SELECT c.id, c.name
           FROM customers c
          WHERE c.shop_id = $1 AND c.deleted_at IS NULL AND ${customerCond}
       ),
       l AS (
         SELECT e.id, e.customer_id, e.entry_type, e.amount, e.occurred_at
           FROM customer_ledger_entries e
           JOIN cust ON cust.id = e.customer_id
          WHERE e.shop_id = $1 AND e.deleted_at IS NULL
       ),
       credit AS (
         SELECT customer_id, SUM(amount) AS total
           FROM l WHERE entry_type = '${LedgerEntryType.CREDIT}'
          GROUP BY customer_id
       ),
       debit AS (
         SELECT customer_id, amount, occurred_at,
                SUM(amount) OVER (
                  PARTITION BY customer_id ORDER BY occurred_at, id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS running
           FROM l WHERE entry_type = '${LedgerEntryType.DEBIT}'
       )
       SELECT d.customer_id, cust.name AS customer_name, d.occurred_at,
              LEAST(d.amount, d.running - COALESCE(cr.total, 0)) AS remaining
         FROM debit d
         JOIN cust ON cust.id = d.customer_id
         LEFT JOIN credit cr ON cr.customer_id = d.customer_id
        WHERE d.running - COALESCE(cr.total, 0) > 0
        ORDER BY d.customer_id, d.occurred_at`,
      params,
    );

    // Müşteri başına açık borç kalemleri.
    const byCustomer = new Map<
      string,
      { name: string; open: { remaining: number; date: Date }[] }
    >();
    for (const r of rows) {
      let entry = byCustomer.get(r.customer_id);
      if (!entry) {
        entry = { name: r.customer_name, open: [] };
        byCustomer.set(r.customer_id, entry);
      }
      entry.open.push({ remaining: Number(r.remaining), date: new Date(r.occurred_at) });
    }

    const result: CustomerAging[] = [];
    for (const [id, { name, open }] of byCustomer) {
      const buckets = this.bucketize(open, asOf);
      if (buckets.total > 0.009) {
        result.push({ customerId: id, customerName: name, ...buckets });
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
