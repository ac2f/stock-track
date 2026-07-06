import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Sale } from '../sales/entities/sale.entity';
import { ProcessingJob } from '../processing/entities/processing-job.entity';
import { CustomersService } from '../customers/services/customers.service';
import { CustomerAccountService } from '../customers/services/customer-account.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Müşteri self-servis portalı — salt-okunur, token doğrulamalı.
 * Müşteri kendi bakiyesini, son hareketlerini ve belgelerini görür; giriş yok.
 */
@Injectable()
export class PortalService {
  private readonly baseCurrency: string;

  constructor(
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    @InjectRepository(ProcessingJob)
    private readonly jobsRepo: Repository<ProcessingJob>,
    private readonly customersService: CustomersService,
    private readonly accountService: CustomerAccountService,
    private readonly settingsService: SettingsService,
    configService: ConfigService,
  ) {
    this.baseCurrency =
      configService.get<string>('currency.base') ??
      configService.get<string>('business.defaultCurrency') ??
      'TRY';
  }

  async summary(token: string) {
    const customer = await this.resolve(token);
    // Portal başlığında "StockTrack" yerine ayarlardaki işletme adı görünsün.
    const business = await this.settingsService.getBusiness();
    return {
      businessName: business.name,
      name: customer.name,
      companyName: customer.companyName ?? null,
      currentBalance: Number(customer.currentBalance),
      currency: this.baseCurrency,
    };
  }

  async ledger(token: string) {
    const customer = await this.resolve(token);
    const entries = await this.accountService.listLedger(customer.id);
    return entries.slice(0, 50).map((e) => ({
      date: e.occurredAt,
      type: e.entryType,
      sourceType: e.sourceType,
      amount: Number(e.amount),
      balanceAfter: Number(e.balanceAfter),
      description: e.description ?? null,
    }));
  }

  async documents(token: string) {
    const customer = await this.resolve(token);
    const [sales, processing] = await Promise.all([
      this.salesRepo.find({
        where: { buyerCustomerId: customer.id },
        order: { saleDate: 'DESC' },
        take: 20,
      }),
      this.jobsRepo.find({
        where: { customerId: customer.id },
        order: { processedAt: 'DESC' },
        take: 20,
      }),
    ]);
    return {
      sales: sales.map((s) => ({
        id: s.id,
        date: s.saleDate,
        total: Number(s.saleTotal),
        currency: s.currency,
      })),
      processing: processing.map((j) => ({
        id: j.id,
        date: j.processedAt,
        item: j.plate?.name ?? null,
        total: Number(j.totalCost),
        currency: j.currency,
        status: j.status,
      })),
    };
  }

  private async resolve(token: string): Promise<Customer> {
    const customer = await this.customersService.findByPortalToken(token);
    if (!customer) {
      throw new NotFoundException('Geçersiz veya iptal edilmiş portal bağlantısı.');
    }
    return customer;
  }
}
