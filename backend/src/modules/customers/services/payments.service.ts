import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { PaymentDirection } from '../../../common/enums/payment-direction.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { BankAccountsService } from '../../bank-accounts/bank-accounts.service';
import { UsersService } from '../../users/users.service';
import { CurrencyService } from '../../currency/currency.service';
import { Payment } from '../entities/payment.entity';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { CustomerAccountService } from './customer-account.service';

export interface PaymentResult {
  payment: Payment;
  currentBalance: number;
}

@Injectable()
export class PaymentsService {
  private readonly defaultCurrency: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    private readonly accountService: CustomerAccountService,
    private readonly usersService: UsersService,
    private readonly bankAccountsService: BankAccountsService,
    private readonly currencyService: CurrencyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.defaultCurrency =
      configService.get<string>('business.defaultCurrency') ?? 'TRY';
  }

  /**
   * Müşteriden tahsilat (INCOMING) veya malzeme sahibine ödeme (OUTGOING) kaydeder.
   * Tek transaction içinde:
   *  1) yöntem kuralını doğrular (nakit→çalışan / havale→banka),
   *  2) yabancı para ise baz tutara çevirir,
   *  3) cariye CREDIT (tahsilat) / DEBIT (sahibe ödeme) uygular,
   *  4) ödemeyi balance_after ile kaydeder.
   */
  async create(
    customerId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentResult> {
    await this.validateMethod(dto);
    const direction = dto.direction ?? PaymentDirection.INCOMING;
    const occurredAt = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    const currency = (dto.currency ?? this.defaultCurrency).toUpperCase();
    const { amount: baseAmount, rate: exchangeRate } =
      await this.currencyService.convert(
        dto.amount,
        currency,
        this.currencyService.baseCurrency,
        occurredAt,
      );

    const result = await this.dataSource.transaction(async (manager) => {
      const payment = manager.create(Payment, {
        customerId,
        direction,
        amount: dto.amount,
        currency,
        exchangeRate,
        baseAmount,
        method: dto.method,
        paymentDate: occurredAt,
        receivedById:
          dto.method === PaymentMethod.CASH ? dto.receivedById : undefined,
        bankAccountId:
          dto.method === PaymentMethod.BANK_TRANSFER
            ? dto.bankAccountId
            : undefined,
        cardBusinessName:
          dto.method === PaymentMethod.CARD ? dto.cardBusinessName : undefined,
        referenceNo: dto.referenceNo,
        note: dto.note,
        balanceAfter: 0,
      });
      const saved = await manager.save(payment);

      // Tahsilat → CREDIT (borç azalır); sahibe ödeme → DEBIT (alacağı azalır).
      const movement = {
        customerId,
        amount: baseAmount,
        sourceType: LedgerSourceType.PAYMENT,
        sourceId: saved.id,
        description: this.describe(dto, direction),
        occurredAt,
      };
      const balanceAfter =
        direction === PaymentDirection.INCOMING
          ? await this.accountService.applyCredit(manager, movement)
          : await this.accountService.applyDebit(manager, movement);

      saved.balanceAfter = balanceAfter;
      await manager.save(saved);

      return { payment: saved, currentBalance: balanceAfter };
    });

    // Commit sonrası bildirim olayı (rollback'te tetiklenmez).
    this.eventEmitter.emit('payment.received', {
      customerId,
      paymentId: result.payment.id,
      amount: result.payment.amount,
      baseAmount: result.payment.baseAmount,
      direction,
      balanceAfter: result.currentBalance,
    });

    return result;
  }

  list(customerId: string): Promise<Payment[]> {
    return this.paymentsRepo.find({
      where: { customerId },
      order: { paymentDate: 'DESC' },
    });
  }

  /**
   * Tahsil edilmemiş (settledAt NULL) NAKİT tahsilatları çalışan bazında özetler.
   * "Hangi çalışanın üzerinde ne kadar tahsil edilmemiş nakit var" görünümü (#4/#5).
   */
  async cashCollectionsByEmployee(): Promise<
    { employeeId: string; employeeName: string; count: number; total: number }[]
  > {
    const rows = await this.paymentsRepo
      .createQueryBuilder('p')
      .innerJoin('p.receivedBy', 'u')
      .select('u.id', 'employeeId')
      .addSelect('u.full_name', 'employeeName')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.method = :m', { m: PaymentMethod.CASH })
      .andWhere('p.direction = :d', { d: PaymentDirection.INCOMING })
      .andWhere('p.settled_at IS NULL')
      .groupBy('u.id')
      .addGroupBy('u.full_name')
      .orderBy('total', 'DESC')
      .getRawMany<{ employeeId: string; employeeName: string; count: string; total: string }>();
    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      count: Number(r.count),
      total: Number(r.total),
    }));
  }

  /**
   * Bir çalışanın tahsil edilmemiş nakit tahsilatlarını "işletmeye teslim edildi"
   * (settledAt=now) olarak işaretler — böylece bir daha "bekleyen" listede çıkmaz.
   */
  async settleEmployeeCash(
    receivedById: string,
  ): Promise<{ settledCount: number; settledTotal: number }> {
    await this.usersService.findOne(receivedById);
    const pending = await this.paymentsRepo.find({
      where: {
        receivedById,
        method: PaymentMethod.CASH,
        direction: PaymentDirection.INCOMING,
        settledAt: IsNull(),
      },
    });
    const settledTotal = pending.reduce((s, p) => s + Number(p.amount), 0);
    const now = new Date();
    for (const p of pending) p.settledAt = now;
    if (pending.length) await this.paymentsRepo.save(pending);
    return { settledCount: pending.length, settledTotal };
  }

  /** Çapraz-müşteri ödeme sorgusu: çalışan / yöntem / tarih / tahsil durumu (#4). */
  async query(filters: {
    receivedById?: string;
    method?: PaymentMethod;
    from?: string;
    to?: string;
    settled?: boolean;
  }): Promise<Payment[]> {
    const qb = this.paymentsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.receivedBy', 'receivedBy')
      .leftJoinAndSelect('p.bankAccount', 'bankAccount')
      .leftJoinAndSelect('p.customer', 'customer')
      // NOT: join + take birlikteyken TypeORM sayfalama için orderBy'ı seçili
      // ifadelerle eşler; bu yüzden ham DB sütunu ('p.payment_date') değil entity
      // property'si ('p.paymentDate') kullanılmalı, aksi halde 'databaseName' hatası.
      .orderBy('p.paymentDate', 'DESC')
      .take(200);
    if (filters.receivedById) {
      qb.andWhere('p.received_by_id = :rid', { rid: filters.receivedById });
    }
    if (filters.method) qb.andWhere('p.method = :m', { m: filters.method });
    if (filters.from) qb.andWhere('p.payment_date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('p.payment_date <= :to', { to: filters.to });
    if (filters.settled === true) qb.andWhere('p.settled_at IS NOT NULL');
    if (filters.settled === false) qb.andWhere('p.settled_at IS NULL');
    return qb.getMany();
  }

  /**
   * Yöntem bazlı zorunluluklar:
   *  - CASH          → receivedById zorunlu, bankAccountId yasak.
   *  - BANK_TRANSFER → bankAccountId zorunlu, receivedById yasak.
   * İlgili kayıtların gerçekten var olduğu da doğrulanır.
   */
  private async validateMethod(dto: CreatePaymentDto): Promise<void> {
    if (dto.method === PaymentMethod.CASH) {
      if (!dto.receivedById) {
        throw new BadRequestException(
          'Nakit ödemede parayı teslim alan/veren çalışan (receivedById) zorunludur.',
        );
      }
      if (dto.bankAccountId) {
        throw new BadRequestException(
          'Nakit ödemede banka hesabı belirtilemez.',
        );
      }
      await this.usersService.findOne(dto.receivedById);
    } else if (dto.method === PaymentMethod.BANK_TRANSFER) {
      if (!dto.bankAccountId) {
        throw new BadRequestException(
          'Havale/EFT ödemesinde banka hesabı (bankAccountId) zorunludur.',
        );
      }
      if (dto.receivedById) {
        throw new BadRequestException(
          'Havale ödemesinde teslim alan çalışan belirtilemez.',
        );
      }
      await this.bankAccountsService.findOne(dto.bankAccountId);
    } else if (dto.method === PaymentMethod.CARD) {
      if (dto.receivedById || dto.bankAccountId) {
        throw new BadRequestException(
          'Kart ödemesinde çalışan veya banka hesabı belirtilemez.',
        );
      }
    }
  }

  private describe(dto: CreatePaymentDto, direction: PaymentDirection): string {
    const kind =
      direction === PaymentDirection.INCOMING ? 'tahsilat' : 'sahibe ödeme';
    const channel =
      dto.method === PaymentMethod.CASH
        ? 'Nakit'
        : dto.method === PaymentMethod.CARD
          ? `Kart${dto.cardBusinessName ? ` (${dto.cardBusinessName})` : ''}`
          : 'Havale/EFT';
    return `${channel} ${kind}${dto.referenceNo ? ` (${dto.referenceNo})` : ''}`;
  }
}
