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
