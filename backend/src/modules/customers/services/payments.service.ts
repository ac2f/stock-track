import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    }
  }

  private describe(dto: CreatePaymentDto, direction: PaymentDirection): string {
    const kind =
      direction === PaymentDirection.INCOMING ? 'tahsilat' : 'sahibe ödeme';
    const channel = dto.method === PaymentMethod.CASH ? 'Nakit' : 'Havale/EFT';
    return `${channel} ${kind}${dto.referenceNo ? ` (${dto.referenceNo})` : ''}`;
  }
}
