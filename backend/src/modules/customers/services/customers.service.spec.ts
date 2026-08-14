import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CustomerLedgerEntry } from '../entities/customer-ledger-entry.entity';
import { CustomersService } from './customers.service';

/**
 * Cari ekstresinden yanlış hareketi geri alma (#silme).
 * Yalnızca elle girilen hareketler (ödeme / indirim / manuel) geri alınabilir;
 * işleme-satış-açılış hareketleri kaynak kaydına aittir.
 */
describe('CustomersService — cari hareketi geri alma', () => {
  const CUSTOMER = 'c1';

  function buildService(entry: Partial<CustomerLedgerEntry> | null) {
    const deleted: unknown[] = [];
    const manager = {
      delete: (entity: unknown, criteria: unknown) => {
        deleted.push({ entity, criteria });
        return Promise.resolve({ affected: 1 });
      },
    };

    const accountService = {
      recomputeBalances: jest.fn(() => Promise.resolve(120)),
    };
    const paymentsService = {
      remove: jest.fn(() => Promise.resolve({ currentBalance: 999 })),
    };

    const service = new CustomersService(
      { findOne: jest.fn(() => Promise.resolve({ id: CUSTOMER })) } as never,
      {
        findOne: jest.fn(() =>
          Promise.resolve(
            entry
              ? {
                  id: 'e1',
                  customerId: CUSTOMER,
                  entryType: LedgerEntryType.CREDIT,
                  createdAt: new Date(),
                  ...entry,
                }
              : null,
          ),
        ),
      } as never,
      accountService as never,
      paymentsService as never,
      {
        transaction: (cb: (m: unknown) => Promise<unknown>) => cb(manager),
      } as never,
    );

    return { service, paymentsService, accountService, deleted };
  }

  it('indirim hareketini siler ve bakiyeyi yeniden hesaplar', async () => {
    const { service, accountService, deleted } = buildService({
      sourceType: LedgerSourceType.DISCOUNT,
    });

    const result = await service.removeLedgerEntry(CUSTOMER, 'e1', UserRole.OWNER);

    expect(deleted).toEqual([
      { entity: CustomerLedgerEntry, criteria: { id: 'e1' } },
    ]);
    expect(accountService.recomputeBalances).toHaveBeenCalled();
    expect(result.currentBalance).toBe(120);
  });

  it('ödemeye bağlı hareket için ödemenin kendisini siler', async () => {
    const { service, paymentsService, deleted } = buildService({
      sourceType: LedgerSourceType.PAYMENT,
      sourceId: 'p1',
    });

    const result = await service.removeLedgerEntry(
      CUSTOMER,
      'e1',
      UserRole.EMPLOYEE,
    );

    expect(paymentsService.remove).toHaveBeenCalledWith(
      CUSTOMER,
      'p1',
      UserRole.EMPLOYEE,
    );
    expect(deleted).toEqual([]); // defter satırı ödeme silinirken kalkar
    expect(result.currentBalance).toBe(999);
  });

  it('işleme/satış kaynaklı hareketi silmeyi reddeder', async () => {
    const { service } = buildService({ sourceType: LedgerSourceType.PROCESSING });

    await expect(
      service.removeLedgerEntry(CUSTOMER, 'e1', UserRole.OWNER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('manuel hareketi yalnızca işletme sahibi geri alabilir', async () => {
    const { service } = buildService({
      sourceType: LedgerSourceType.MANUAL_ADJUSTMENT,
    });

    await expect(
      service.removeLedgerEntry(CUSTOMER, 'e1', UserRole.EMPLOYEE),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('çalışan 3 günden eski hareketi geri alamaz', async () => {
    const { service } = buildService({
      sourceType: LedgerSourceType.DISCOUNT,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    await expect(
      service.removeLedgerEntry(CUSTOMER, 'e1', UserRole.EMPLOYEE),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

/**
 * Ekstre dönemi: varsayılan olarak borcun en son kapandığı andan bugüne.
 * "Kapanma", yürüyen bakiyenin sıfıra indiği harekettir (tahsilatla ya da
 * indirimle fark etmez). Dönem başındaki bakiye devir olarak döner.
 */
describe('CustomersService — ekstre dönemi', () => {
  /** Kronolojik defter: [tarih, tip, tutar] → yürüyen bakiye hesaplanır. */
  function buildService(rows: [string, 'debit' | 'credit', number][]) {
    let running = 0;
    const entries = rows.map(([date, entryType, amount], i) => {
      running += entryType === 'debit' ? amount : -amount;
      return {
        id: `e${i}`,
        occurredAt: new Date(date),
        entryType,
        amount,
        balanceAfter: Math.round(running * 100) / 100,
        sourceType: LedgerSourceType.PROCESSING,
      };
    });

    const service = new CustomersService(
      { findOne: jest.fn(() => Promise.resolve({ id: 'c1' })) } as never,
      {} as never,
      { listLedger: jest.fn(() => Promise.resolve(entries)) } as never,
      {} as never,
      {} as never,
    );
    return service;
  }

  // 1000 borç → 1000 ödeme (bakiye 0 = borç kapandı) → 300 + 200 yeni borç.
  const LEDGER: [string, 'debit' | 'credit', number][] = [
    ['2026-01-10', 'debit', 1000],
    ['2026-02-05', 'credit', 1000],
    ['2026-03-01', 'debit', 300],
    ['2026-03-20', 'debit', 200],
  ];

  it('varsayılan olarak son borç kapatmadan sonrasını gösterir', async () => {
    const service = buildService(LEDGER);

    const s = await service.getStatement('c1');

    expect(s.scope).toBe('since-settlement');
    expect(s.lastSettledAt).toBe(new Date('2026-02-05').toISOString());
    expect(s.entries.map((e) => Number(e.amount))).toEqual([300, 200]);
    expect(s.openingBalance).toBe(0); // kapanmıştı
    expect(s.closingBalance).toBe(500);
    expect(s.hasEarlier).toBe(true);
  });

  it('scope=all tüm geçmişi verir', async () => {
    const service = buildService(LEDGER);

    const s = await service.getStatement('c1', { scope: 'all' });

    expect(s.scope).toBe('all');
    expect(s.entries).toHaveLength(4);
    expect(s.hasEarlier).toBe(false);
    expect(s.openingBalance).toBe(0);
  });

  it('tarih aralığı seçilince kapanmadan öncesi de görülebilir', async () => {
    const service = buildService(LEDGER);

    const s = await service.getStatement('c1', {
      from: '2026-01-01',
      to: '2026-02-28',
    });

    expect(s.scope).toBe('custom');
    expect(s.entries.map((e) => Number(e.amount))).toEqual([1000, 1000]);
    expect(s.closingBalance).toBe(0);
  });

  it('dönem ortasından başlarken devir bakiyesi verir', async () => {
    const service = buildService(LEDGER);

    const s = await service.getStatement('c1', { from: '2026-03-15' });

    expect(s.entries.map((e) => Number(e.amount))).toEqual([200]);
    expect(s.openingBalance).toBe(300); // 2026-03-01 borcu devreder
    expect(s.closingBalance).toBe(500);
    expect(s.hasEarlier).toBe(true);
  });

  it('bitiş tarihi o günün tamamını kapsar', async () => {
    const service = buildService(LEDGER);

    const s = await service.getStatement('c1', {
      scope: 'all',
      to: '2026-03-01',
    });

    expect(s.entries).toHaveLength(3);
    expect(s.closingBalance).toBe(300);
  });

  it('borç hiç kapanmamışsa tüm geçmişi gösterir', async () => {
    const service = buildService([
      ['2026-01-10', 'debit', 1000],
      ['2026-02-05', 'credit', 400],
    ]);

    const s = await service.getStatement('c1');

    expect(s.scope).toBe('all');
    expect(s.lastSettledAt).toBeNull();
    expect(s.entries).toHaveLength(2);
  });
});
