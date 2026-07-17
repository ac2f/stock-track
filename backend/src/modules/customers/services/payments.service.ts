import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { PaymentDirection } from '../../../common/enums/payment-direction.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';
import { roundMoney } from '../../../common/utils/area.util';
import { BankAccountsService } from '../../bank-accounts/bank-accounts.service';
import { UsersService } from '../../users/users.service';
import { CurrencyService } from '../../currency/currency.service';
import { Payment } from '../entities/payment.entity';
import { CustomerLedgerEntry } from '../entities/customer-ledger-entry.entity';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { UpdatePaymentDto } from '../dto/update-payment.dto';
import { ConvertLegacyDebtCloseDto } from '../dto/convert-legacy-debt-close.dto';
import { CustomerAccountService } from './customer-account.service';

export interface PaymentResult {
  payment: Payment;
  currentBalance: number;
}

/** Geçmiş ödemede düzenleme/silme için izin verilen azami yaş (gün). */
const EDIT_WINDOW_DAYS = 3;

export interface LegacyDebtClose {
  ledgerEntryId: string;
  customerId: string;
  customerName: string;
  amount: number;
  occurredAt: Date;
  description?: string | null;
}

@Injectable()
export class PaymentsService {
  private readonly defaultCurrency: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerRepo: Repository<CustomerLedgerEntry>,
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

    const closeDebt = dto.closeDebt === true;

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
        isDebtClose: closeDebt,
        balanceAfter: 0,
      });
      const saved = await manager.save(payment);

      // Tahsilat → CREDIT (borç azalır); sahibe ödeme → DEBIT (alacağı azalır).
      const movement = {
        customerId,
        amount: baseAmount,
        sourceType: LedgerSourceType.PAYMENT,
        sourceId: saved.id,
        description: this.describe(dto, direction, closeDebt),
        occurredAt,
      };
      let balanceAfter =
        direction === PaymentDirection.INCOMING
          ? await this.accountService.applyCredit(manager, movement)
          : await this.accountService.applyDebit(manager, movement);

      // "Borç kapa": tahsilattan sonra kalan borç varsa kalan fark İNDİRİM olur.
      if (closeDebt && direction === PaymentDirection.INCOMING) {
        const remaining = roundMoney(balanceAfter);
        if (remaining > 0) {
          balanceAfter = await this.accountService.applyCredit(manager, {
            customerId,
            amount: remaining,
            sourceType: LedgerSourceType.DISCOUNT,
            description: `İndirim (borç kapatma — tahsilat ${roundMoney(baseAmount)})`,
            occurredAt,
          });
        }
      }

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
  private async validateMethod(dto: {
    method: PaymentMethod;
    receivedById?: string | null;
    bankAccountId?: string | null;
    cardBusinessName?: string | null;
  }): Promise<void> {
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

  private describe(
    dto: { method: PaymentMethod; cardBusinessName?: string; referenceNo?: string },
    direction: PaymentDirection,
    closeDebt = false,
  ): string {
    const kind = closeDebt
      ? 'tahsilat (borç kapatma)'
      : direction === PaymentDirection.INCOMING
        ? 'tahsilat'
        : 'sahibe ödeme';
    const channel =
      dto.method === PaymentMethod.CASH
        ? 'Nakit'
        : dto.method === PaymentMethod.CARD
          ? `Kart${dto.cardBusinessName ? ` (${dto.cardBusinessName})` : ''}`
          : 'Havale/EFT';
    return `${channel} ${kind}${dto.referenceNo ? ` (${dto.referenceNo})` : ''}`;
  }

  /**
   * Bir ödemeyi düzenler (yalnızca son {@link EDIT_WINDOW_DAYS} gün içinde
   * kaydedilmiş olanlar). Tutar/yöntem/tarih/not değişebilir; bağlı cari
   * hareketi de güncellenir ve yürüyen bakiye yeniden hesaplanır.
   */
  async update(
    customerId: string,
    paymentId: string,
    dto: UpdatePaymentDto,
  ): Promise<PaymentResult> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId, customerId },
    });
    if (!payment) throw new NotFoundException('Ödeme bulunamadı.');
    this.assertEditable(payment);

    // Yeni değerleri hesapla (verilmeyen alanlar korunur).
    const method = dto.method ?? payment.method;
    const amount = dto.amount ?? Number(payment.amount);
    const occurredAt = dto.paymentDate
      ? new Date(dto.paymentDate)
      : payment.paymentDate;
    const currency = (dto.currency ?? payment.currency).toUpperCase();
    const receivedById =
      dto.receivedById !== undefined ? dto.receivedById : payment.receivedById;
    const bankAccountId =
      dto.bankAccountId !== undefined
        ? dto.bankAccountId
        : payment.bankAccountId;
    const cardBusinessName =
      dto.cardBusinessName !== undefined
        ? dto.cardBusinessName
        : payment.cardBusinessName;

    await this.validateMethod({
      method,
      receivedById,
      bankAccountId,
      cardBusinessName,
    });

    const { amount: baseAmount, rate: exchangeRate } =
      await this.currencyService.convert(
        amount,
        currency,
        this.currencyService.baseCurrency,
        occurredAt,
      );

    const currentBalance = await this.dataSource.transaction(async (manager) => {
      payment.method = method;
      payment.amount = amount;
      payment.currency = currency;
      payment.exchangeRate = exchangeRate;
      payment.baseAmount = baseAmount;
      payment.paymentDate = occurredAt;
      payment.receivedById =
        method === PaymentMethod.CASH ? receivedById ?? undefined : undefined;
      payment.bankAccountId =
        method === PaymentMethod.BANK_TRANSFER
          ? bankAccountId ?? undefined
          : undefined;
      payment.cardBusinessName =
        method === PaymentMethod.CARD ? cardBusinessName ?? undefined : undefined;
      if (dto.note !== undefined) payment.note = dto.note;
      await manager.save(payment);

      // Bağlı cari hareketini de güncelle (tutar/tarih/açıklama).
      await this.accountService.updateBySource(
        manager,
        LedgerSourceType.PAYMENT,
        payment.id,
        {
          amount: baseAmount,
          occurredAt,
          description: this.describe(
            { method, cardBusinessName, referenceNo: payment.referenceNo },
            payment.direction,
            payment.isDebtClose,
          ),
        },
      );

      return this.accountService.recomputeBalances(manager, customerId);
    });

    const fresh = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    return { payment: fresh ?? payment, currentBalance };
  }

  /**
   * Bir ödemeyi siler (yalnızca son {@link EDIT_WINDOW_DAYS} gün içinde
   * kaydedilmiş olanlar). Bağlı cari hareketi de silinir ve bakiye yeniden
   * hesaplanır. (Borç kapatma indirimleri ayrı hareket olduğundan korunur.)
   */
  async remove(customerId: string, paymentId: string): Promise<{ currentBalance: number }> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId, customerId },
    });
    if (!payment) throw new NotFoundException('Ödeme bulunamadı.');
    this.assertEditable(payment);

    const currentBalance = await this.dataSource.transaction(async (manager) => {
      await this.accountService.removeBySource(
        manager,
        LedgerSourceType.PAYMENT,
        payment.id,
      );
      await manager.delete(Payment, { id: payment.id });
      return this.accountService.recomputeBalances(manager, customerId);
    });

    return { currentBalance };
  }

  private assertEditable(payment: Payment): void {
    const ageMs = Date.now() - new Date(payment.createdAt).getTime();
    const maxMs = EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > maxMs) {
      throw new ForbiddenException(
        `Yalnızca son ${EDIT_WINDOW_DAYS} gün içinde kaydedilmiş ödemeler düzenlenebilir/silinebilir.`,
      );
    }
  }

  /**
   * Uygulamanın bu güncellemesinden ÖNCE "borç kapatma" ile girilmiş ama gerçek
   * bir ödeme kaydı oluşturmamış cari hareketleri listeler. Bunlar; kaynağı
   * PAYMENT olan fakat bir Payment kaydına bağlı olmayan (source_id NULL) CREDIT
   * hareketleridir. Kullanıcı bunları teker teker gerçek ödemeye çevirebilir.
   */
  async listLegacyDebtClosings(): Promise<LegacyDebtClose[]> {
    const rows = await this.ledgerRepo
      .createQueryBuilder('e')
      .innerJoin('e.customer', 'c')
      .select('e.id', 'ledgerEntryId')
      .addSelect('e.customer_id', 'customerId')
      .addSelect('c.name', 'customerName')
      .addSelect('e.amount', 'amount')
      .addSelect('e.occurred_at', 'occurredAt')
      .addSelect('e.description', 'description')
      .where('e.source_type = :st', { st: LedgerSourceType.PAYMENT })
      .andWhere('e.entry_type = :et', { et: LedgerEntryType.CREDIT })
      .andWhere('e.source_id IS NULL')
      .orderBy('e.occurred_at', 'ASC')
      .getRawMany<{
        ledgerEntryId: string;
        customerId: string;
        customerName: string;
        amount: string;
        occurredAt: Date;
        description: string | null;
      }>();
    return rows.map((r) => ({
      ledgerEntryId: r.ledgerEntryId,
      customerId: r.customerId,
      customerName: r.customerName,
      amount: Number(r.amount),
      occurredAt: r.occurredAt,
      description: r.description,
    }));
  }

  /**
   * Eski bir "borç kapatma" cari hareketini gerçek bir ödemeye çevirir. Yeni bir
   * cari hareketi YARATMAZ; mevcut hareketi yeni Payment'e bağlar (source_id) →
   * bakiye değişmez. Ödemenin varsayılan tarihi hareketin tarihidir.
   */
  async convertLegacyDebtClose(
    ledgerEntryId: string,
    dto: ConvertLegacyDebtCloseDto,
  ): Promise<Payment> {
    const entry = await this.ledgerRepo.findOne({
      where: { id: ledgerEntryId },
    });
    if (
      !entry ||
      entry.sourceType !== LedgerSourceType.PAYMENT ||
      entry.sourceId != null
    ) {
      throw new NotFoundException(
        'Çevrilecek borç kapatma hareketi bulunamadı (zaten çevrilmiş olabilir).',
      );
    }

    await this.validateMethod({
      method: dto.method,
      receivedById: dto.receivedById,
      bankAccountId: dto.bankAccountId,
      cardBusinessName: dto.cardBusinessName,
    });

    const occurredAt = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date(entry.occurredAt);
    const amount = Number(entry.amount);

    return this.dataSource.transaction(async (manager) => {
      const payment = manager.create(Payment, {
        customerId: entry.customerId,
        direction: PaymentDirection.INCOMING,
        amount,
        currency: this.currencyService.baseCurrency,
        exchangeRate: 1,
        baseAmount: amount,
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
        note: dto.note,
        isDebtClose: true,
        balanceAfter: Number(entry.balanceAfter),
      });
      const saved = await manager.save(payment);

      // Mevcut cari hareketini bu ödemeye bağla (bakiye değişmez).
      entry.sourceId = saved.id;
      entry.occurredAt = occurredAt;
      entry.description = this.describe(
        { method: dto.method, cardBusinessName: dto.cardBusinessName },
        PaymentDirection.INCOMING,
        true,
      );
      await manager.save(entry);

      return saved;
    });
  }
}
