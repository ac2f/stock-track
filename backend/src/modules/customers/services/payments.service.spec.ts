import { ForbiddenException } from '@nestjs/common';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { Payment } from '../entities/payment.entity';
import { PaymentsService } from './payments.service';

/**
 * Yanlışlıkla girilen tahsilatın/borç kapatmanın GERİ ALINABİLMESİ.
 *
 * Regresyon: "borç kapa" ile alınan tahsilatta kalan fark ayrı bir İNDİRİM
 * hareketi olarak yazılıyordu ama ödemeye bağlı değildi; ödeme silinince
 * indirim defterde kalıyor, borç geri gelmiyordu.
 */
describe('PaymentsService — ödeme geri alma', () => {
  const CUSTOMER = 'c1';
  const PAYMENT_ID = 'p1';

  type Movement = {
    customerId: string;
    amount: number;
    sourceType: LedgerSourceType;
    sourceId?: string;
  };

  function buildService(
    opts: { creditBalances?: number[]; discounts?: { amount: number }[] } = {},
  ) {
    const credits: Movement[] = [];
    const removed: { sourceType: LedgerSourceType; sourceId: string }[] = [];
    const deleted: unknown[] = [];
    const balances = [...(opts.creditBalances ?? [])];
    // Ödemeye bağlı indirim hareketleri (borç kapatma) için sahte defter.
    type FakeDiscount = {
      id: string;
      amount: number;
      occurredAt: Date;
      description: string;
      removed?: boolean;
    };
    const discounts: FakeDiscount[] = (opts.discounts ?? []).map((d, i) => ({
      id: `d${i}`,
      occurredAt: new Date(),
      description: '',
      ...d,
    }));
    const ledgerRepo = {
      find: jest.fn(() => Promise.resolve(discounts.filter((d) => !d.removed))),
      save: jest.fn((e: unknown) => Promise.resolve(e)),
      remove: jest.fn((e: FakeDiscount | FakeDiscount[]) => {
        for (const row of Array.isArray(e) ? e : [e]) row.removed = true;
        return Promise.resolve(e);
      }),
    };

    const accountService = {
      applyCredit: jest.fn((_m: unknown, mv: Movement) => {
        credits.push(mv);
        return Promise.resolve(balances.shift() ?? 0);
      }),
      applyDebit: jest.fn(() => Promise.resolve(0)),
      removeBySource: jest.fn(
        (_m: unknown, sourceType: LedgerSourceType, sourceId: string) => {
          removed.push({ sourceType, sourceId });
          return Promise.resolve(1);
        },
      ),
      recomputeBalances: jest.fn(() => Promise.resolve(250)),
      updateBySource: jest.fn(() => Promise.resolve()),
    };

    let seq = 0;
    const manager = {
      create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
      save: (entity: Record<string, unknown>) => {
        if (!entity.id) entity.id = `saved-${++seq}`;
        return Promise.resolve(entity);
      },
      delete: (entity: unknown, criteria: unknown) => {
        deleted.push({ entity, criteria });
        return Promise.resolve({ affected: 1 });
      },
      getRepository: () => ledgerRepo,
    };

    const paymentsRepo = {
      findOne: jest.fn(),
    };

    const service = new PaymentsService(
      paymentsRepo as never,
      {} as never, // ledgerRepo (bu testlerde kullanılmıyor)
      accountService as never,
      { findOne: jest.fn(() => Promise.resolve({ id: 'u1' })) } as never,
      { findOne: jest.fn(() => Promise.resolve({ id: 'b1' })) } as never,
      {
        baseCurrency: 'TRY',
        convert: jest.fn((amount: number) =>
          Promise.resolve({ amount, rate: 1 }),
        ),
      } as never,
      { emit: jest.fn() } as never,
      {
        transaction: (cb: (m: unknown) => Promise<unknown>) => cb(manager),
      } as never,
      { get: jest.fn(() => 'TRY') } as never,
    );

    return {
      service,
      paymentsRepo,
      accountService,
      credits,
      removed,
      deleted,
      discounts,
    };
  }

  /** Belirtilen gün kadar eski kaydedilmiş borç kapatma ödemesi. */
  const payment = (ageDays: number, baseAmount = 60): Payment =>
    ({
      id: PAYMENT_ID,
      customerId: CUSTOMER,
      isDebtClose: true,
      method: PaymentMethod.CARD,
      amount: baseAmount,
      baseAmount,
      currency: 'TRY',
      paymentDate: new Date(),
      createdAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000),
    }) as Payment;

  it('borç kapatma indirimini ödemeye bağlar (geri alınabilsin diye)', async () => {
    // Tahsilat sonrası 40 TL borç kalıyor → tamamı indirim yazılmalı.
    const { service, credits } = buildService({ creditBalances: [40, 0] });

    await service.create(CUSTOMER, {
      amount: 60,
      method: PaymentMethod.CARD,
      closeDebt: true,
    } as never);

    expect(credits).toHaveLength(2);
    expect(credits[0].sourceType).toBe(LedgerSourceType.PAYMENT);
    const discount = credits[1];
    expect(discount.sourceType).toBe(LedgerSourceType.DISCOUNT);
    expect(discount.amount).toBe(40);
    // Kritik: indirim, ödemenin id'sine bağlı olmalı.
    expect(discount.sourceId).toBe(credits[0].sourceId);
  });

  it('ödemeyi silerken bağlı borç kapatma indirimini de geri alır', async () => {
    const { service, paymentsRepo, removed, deleted } = buildService();
    paymentsRepo.findOne.mockResolvedValue(payment(0));

    const result = await service.remove(CUSTOMER, PAYMENT_ID);

    expect(removed).toEqual([
      { sourceType: LedgerSourceType.PAYMENT, sourceId: PAYMENT_ID },
      { sourceType: LedgerSourceType.DISCOUNT, sourceId: PAYMENT_ID },
    ]);
    expect(deleted).toEqual([
      { entity: Payment, criteria: { id: PAYMENT_ID } },
    ]);
    expect(result.currentBalance).toBe(250);
  });

  it('borç kapatma tahsilatı düzeltilince indirimi ters yönde dengeler', async () => {
    // 60 tahsilat + 40 indirim = 100 borç. Tahsilat 80'e çıkarsa indirim 20 olur.
    const { service, paymentsRepo, discounts } = buildService({
      discounts: [{ amount: 40 }],
    });
    paymentsRepo.findOne.mockResolvedValue(payment(0, 60));

    await service.update(CUSTOMER, PAYMENT_ID, { amount: 80 });

    expect(discounts[0].amount).toBe(20);
    expect(discounts[0].removed).toBeUndefined();
  });

  it('tahsilat borcun tamamını karşılarsa indirimi tamamen kaldırır', async () => {
    const { service, paymentsRepo, discounts } = buildService({
      discounts: [{ amount: 40 }],
    });
    paymentsRepo.findOne.mockResolvedValue(payment(0, 60));

    await service.update(CUSTOMER, PAYMENT_ID, { amount: 100 });

    expect(discounts[0].removed).toBe(true);
  });

  it('çalışan eski ödemeyi silemez, işletme sahibi silebilir', async () => {
    const { service, paymentsRepo } = buildService();
    paymentsRepo.findOne.mockResolvedValue(payment(10));

    await expect(
      service.remove(CUSTOMER, PAYMENT_ID, UserRole.EMPLOYEE),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.remove(CUSTOMER, PAYMENT_ID, UserRole.OWNER),
    ).resolves.toEqual({ currentBalance: 250 });
  });
});
