import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { CustomerLedgerEntry } from '../entities/customer-ledger-entry.entity';
import { CustomerAccountService } from './customer-account.service';

/**
 * Ekstrede bakiye sütunu.
 *
 * Regresyon: `balance_after` hareketin YAZILDIĞI andaki bakiyedir. Geçmiş
 * tarihli bir iş sonradan faturalanınca (11.08 tarihli iş, 12.08 tarihliden
 * sonra deftere girince) bu anlık görüntü kronolojik sırayla uyuşmuyor,
 * ekstre tarihe göre dizilince bakiye 2.379 → 1.665 → 951 → 475 → 2.784 diye
 * zıplıyordu. Ekstre artık bakiyeyi kronolojik sırada yeniden yürütüyor.
 */
describe('CustomerAccountService — ekstrede yürüyen bakiye', () => {
  const CUSTOMER = 'c1';

  /** DB'nin döneceği sıra: occurred_at ASC, created_at ASC. */
  function buildService(rows: Partial<CustomerLedgerEntry>[]) {
    const find = jest.fn(() =>
      Promise.resolve(
        rows.map((r) => ({
          entryType: LedgerEntryType.DEBIT,
          sourceType: LedgerSourceType.PROCESSING,
          ...r,
        })),
      ),
    );
    const service = new CustomerAccountService({ find } as never);
    return { service, find };
  }

  it('kronolojik sırada ister ve bakiyeyi baştan yürütür', async () => {
    // Ekrandaki gerçek senaryo: iki 713,70 (11.08) araya sonradan girmişti.
    const { service, find } = buildService([
      { id: '1', occurredAt: new Date('2026-08-11'), amount: 713.7, balanceAfter: 2379 },
      { id: '2', occurredAt: new Date('2026-08-11'), amount: 713.7, balanceAfter: 1665.3 },
      { id: '3', occurredAt: new Date('2026-08-12'), amount: 475.8, balanceAfter: 951.6 },
      { id: '4', occurredAt: new Date('2026-08-12'), amount: 475.8, balanceAfter: 475.8 },
      { id: '5', occurredAt: new Date('2026-08-14'), amount: 405, balanceAfter: 2784 },
    ]);

    const ledger = await service.listLedger(CUSTOMER);

    expect(find).toHaveBeenCalledWith({
      where: { customerId: CUSTOMER },
      order: { occurredAt: 'ASC', createdAt: 'ASC' },
    });
    // Aşağı doğru artan; son satır güncel bakiyeye eşit.
    expect(ledger.map((e) => Number(e.balanceAfter))).toEqual([
      713.7, 1427.4, 1903.2, 2379, 2784,
    ]);
  });

  it('tahsilat/alacak satırında bakiyeyi düşürür', async () => {
    const { service } = buildService([
      { id: '1', occurredAt: new Date('2026-08-11'), amount: 1000 },
      {
        id: '2',
        occurredAt: new Date('2026-08-12'),
        amount: 400,
        entryType: LedgerEntryType.CREDIT,
        sourceType: LedgerSourceType.PAYMENT,
      },
      { id: '3', occurredAt: new Date('2026-08-13'), amount: 250 },
    ]);

    const ledger = await service.listLedger(CUSTOMER);

    expect(ledger.map((e) => Number(e.balanceAfter))).toEqual([1000, 600, 850]);
  });
});
