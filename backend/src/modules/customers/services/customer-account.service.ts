import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { roundMoney } from '../../../common/utils/area.util';
import { Customer } from '../entities/customer.entity';
import { CustomerLedgerEntry } from '../entities/customer-ledger-entry.entity';

export interface LedgerMovement {
  customerId: string;
  amount: number;
  sourceType: LedgerSourceType;
  sourceId?: string;
  description?: string;
  occurredAt?: Date;
}

/**
 * Cari hesap DOMAIN servisi.
 *
 * Borç biriktirme ve azaltmanın TEK sahibi burasıdır. Her hareket:
 *  1) müşteri satırını kilitler (cluster'da yarış koşulunu önler),
 *  2) yeni bakiyeyi hesaplar,
 *  3) defter (ledger) hareketi yazar — balance_after ile,
 *  4) customers.current_balance'ı günceller.
 *
 * Tüm metotlar bir EntityManager (transaction) içinde çağrılacak şekilde
 * tasarlanmıştır → işleme/ödeme akışlarıyla atomik kalır.
 */
@Injectable()
export class CustomerAccountService {
  constructor(
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerRepo: Repository<CustomerLedgerEntry>,
  ) {}

  /** Borç artışı (örn. işleme faturalandı). Yeni bakiyeyi döner. */
  applyDebit(manager: EntityManager, m: LedgerMovement): Promise<number> {
    return this.applyMovement(manager, LedgerEntryType.DEBIT, m);
  }

  /** Borç azalışı (örn. müşteri ödemesi). Yeni bakiyeyi döner. */
  applyCredit(manager: EntityManager, m: LedgerMovement): Promise<number> {
    return this.applyMovement(manager, LedgerEntryType.CREDIT, m);
  }

  private async applyMovement(
    manager: EntityManager,
    type: LedgerEntryType,
    m: LedgerMovement,
  ): Promise<number> {
    // Satırı kilitleyerek oku → eşzamanlı hareketlerde tutarlılık.
    const customer = await manager.findOne(Customer, {
      where: { id: m.customerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı.');
    }

    const amount = roundMoney(m.amount);
    const signed = type === LedgerEntryType.DEBIT ? amount : -amount;
    const balanceAfter = roundMoney(Number(customer.currentBalance) + signed);

    customer.currentBalance = balanceAfter;
    await manager.save(customer);

    const entry = manager.create(CustomerLedgerEntry, {
      customerId: customer.id,
      entryType: type,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      amount,
      balanceAfter,
      description: m.description,
      occurredAt: m.occurredAt ?? new Date(),
    });
    await manager.save(entry);

    return balanceAfter;
  }

  /**
   * Defteri baştan toplayarak bakiyeyi yeniden hesaplar (doğrulama/onarım).
   * Cache'lenmiş current_balance ile çapraz kontrol için kullanılır.
   */
  async recalculate(
    manager: EntityManager,
    customerId: string,
  ): Promise<number> {
    const customer = await manager.findOne(Customer, {
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı.');
    }

    const totals = await manager
      .getRepository(CustomerLedgerEntry)
      .createQueryBuilder('e')
      .select(
        `COALESCE(SUM(CASE WHEN e.entry_type = :debit THEN e.amount ELSE 0 END), 0)`,
        'debit',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN e.entry_type = :credit THEN e.amount ELSE 0 END), 0)`,
        'credit',
      )
      .where('e.customer_id = :customerId', { customerId })
      .setParameters({
        debit: LedgerEntryType.DEBIT,
        credit: LedgerEntryType.CREDIT,
      })
      .getRawOne<{ debit: string; credit: string }>();

    const balance = roundMoney(
      Number(totals?.debit ?? 0) - Number(totals?.credit ?? 0),
    );
    customer.currentBalance = balance;
    await manager.save(customer);
    return balance;
  }

  /** Müşterinin cari defter dökümü (geçmişe dönük izlenebilirlik). */
  listLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    return this.ledgerRepo.find({
      where: { customerId },
      order: { occurredAt: 'DESC' },
    });
  }
}
