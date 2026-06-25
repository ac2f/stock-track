import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { BankAccountsService } from '../../bank-accounts/bank-accounts.service';
import { UsersService } from '../../users/users.service';
import { Payment } from '../entities/payment.entity';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { CustomerAccountService } from './customer-account.service';

export interface PaymentResult {
  payment: Payment;
  currentBalance: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    private readonly accountService: CustomerAccountService,
    private readonly usersService: UsersService,
    private readonly bankAccountsService: BankAccountsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Müşteriden ödeme alır. Tek transaction içinde:
   *  1) yöntem kuralını doğrular (nakit→çalışan / havale→banka),
   *  2) cariye CREDIT hareketi uygular → kalan borç hesaplanır,
   *  3) ödemeyi balance_after ile kaydeder.
   */
  async create(
    customerId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentResult> {
    await this.validateMethod(dto);
    const occurredAt = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    return this.dataSource.transaction(async (manager) => {
      // 1) Ödemeyi kaydet (id almak için); balance_after sonra yazılır.
      const payment = manager.create(Payment, {
        customerId,
        amount: dto.amount,
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

      // 2) Cariye CREDIT uygula; defter hareketi doğrudan bu ödemeye bağlanır.
      const balanceAfter = await this.accountService.applyCredit(manager, {
        customerId,
        amount: dto.amount,
        sourceType: LedgerSourceType.PAYMENT,
        sourceId: saved.id,
        description: this.describe(dto),
        occurredAt,
      });

      // 3) Ödeme sonrası kalan borcu ödemeye yaz.
      saved.balanceAfter = balanceAfter;
      await manager.save(saved);

      return { payment: saved, currentBalance: balanceAfter };
    });
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
          'Nakit ödemede parayı teslim alan çalışan (receivedById) zorunludur.',
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
          'Havale/EFT ödemesinde hedef banka hesabı (bankAccountId) zorunludur.',
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

  private describe(dto: CreatePaymentDto): string {
    return dto.method === PaymentMethod.CASH
      ? 'Nakit tahsilat'
      : `Havale/EFT tahsilatı${dto.referenceNo ? ` (${dto.referenceNo})` : ''}`;
  }
}
