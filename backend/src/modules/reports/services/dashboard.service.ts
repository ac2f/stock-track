import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentDirection } from '../../../common/enums/payment-direction.enum';
import { Customer } from '../../customers/entities/customer.entity';
import { Payment } from '../../customers/entities/payment.entity';
import { ProcessingJob } from '../../processing/entities/processing-job.entity';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { Sale } from '../../sales/entities/sale.entity';

export interface DashboardSummary {
  baseCurrency: string;
  totalReceivable: number; // müşterilerden toplam alacak
  totalPayable: number; // sahiplere toplam borç
  todayCollected: number;
  monthCollected: number;
  monthProcessingRevenue: number;
  monthSalesTurnover: number;
  monthSalesMargin: number;
  criticalStockCount: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(ProcessingJob)
    private readonly jobsRepo: Repository<ProcessingJob>,
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
  ) {}

  async summary(baseCurrency: string): Promise<DashboardSummary> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      receivable,
      payable,
      todayCollected,
      monthCollected,
      processingRevenue,
      sales,
      criticalStockCount,
    ] = await Promise.all([
      this.sum(this.customersRepo, 'c', 'c.current_balance', 'c.current_balance > 0'),
      this.sum(this.customersRepo, 'c', '-c.current_balance', 'c.current_balance < 0'),
      this.sumPayments(PaymentDirection.INCOMING, dayStart),
      this.sumPayments(PaymentDirection.INCOMING, monthStart),
      this.jobsRepo
        .createQueryBuilder('j')
        .select('COALESCE(SUM(j.base_total_cost), 0)', 'v')
        .where('j.is_billed = true')
        .andWhere('j.processed_at >= :monthStart', { monthStart })
        .getRawOne<{ v: string }>(),
      this.salesRepo
        .createQueryBuilder('s')
        .select('COALESCE(SUM(s.base_sale_total), 0)', 'turnover')
        .addSelect('COALESCE(SUM(s.base_sale_total - s.base_owner_amount), 0)', 'margin')
        .where('s.sale_date >= :monthStart', { monthStart })
        .getRawOne<{ turnover: string; margin: string }>(),
      this.platesRepo
        .createQueryBuilder('p')
        .where('p.reorder_level IS NOT NULL')
        .andWhere('p.quantity_in_stock <= p.reorder_level')
        .getCount(),
    ]);

    return {
      baseCurrency,
      totalReceivable: Number(receivable),
      totalPayable: Number(payable),
      todayCollected: Number(todayCollected),
      monthCollected: Number(monthCollected),
      monthProcessingRevenue: Number(processingRevenue?.v ?? 0),
      monthSalesTurnover: Number(sales?.turnover ?? 0),
      monthSalesMargin: Number(sales?.margin ?? 0),
      criticalStockCount,
    };
  }

  private async sum(
    repo: Repository<Customer>,
    alias: string,
    expr: string,
    where: string,
  ): Promise<number> {
    const row = await repo
      .createQueryBuilder(alias)
      .select(`COALESCE(SUM(${expr}), 0)`, 'v')
      .where(where)
      .getRawOne<{ v: string }>();
    return Number(row?.v ?? 0);
  }

  private async sumPayments(
    direction: PaymentDirection,
    from: Date,
  ): Promise<number> {
    const row = await this.paymentsRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.base_amount), 0)', 'v')
      .where('p.direction = :direction', { direction })
      .andWhere('p.payment_date >= :from', { from })
      .getRawOne<{ v: string }>();
    return Number(row?.v ?? 0);
  }
}
