import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { LedgerSourceType } from '../../common/enums/ledger-source-type.enum';
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../common/enums/sale-source.enum';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SalesService } from './sales.service';

/**
 * Konsinye (müşteri malzemesi) satışında cari yansıması.
 *
 * Regresyon: bir müşterinin BİRDEN FAZLA malzemesi satıldığında sahibin
 * bakiyesinden yalnızca tek kalemin tutarı düşüyordu — arayüz yalnızca elle
 * "müşteri malzemesi" seçilen kalemi konsinye işaretlediği, diğerleri "işletme
 * stoğu" olarak gittiği için. Artık kalemin sahibi stok gerçeğinden belirlenir.
 */
describe('SalesService — konsinye satışta sahip payı', () => {
  const OWNER = '11111111-1111-1111-1111-111111111111';
  const BUYER = '22222222-2222-2222-2222-222222222222';
  const PLATE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const PLATE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  /** Adet bazlı (m² hesabı devreye girmesin) sahte stok kalemi. */
  const plate = (id: string, businessQty = 0) => ({
    id,
    measurementType: MeasurementType.PIECE,
    widthMm: null,
    heightMm: null,
    quantityInStock: businessQty,
    name: `Malzeme ${id.slice(0, 1)}`,
  });

  type Credit = { customerId: string; amount: number };

  function buildService(opts: {
    /** plateId → konsinye sahibi müşteri id'leri. */
    owners?: Record<string, string[]>;
    /** plateId → işletmenin kendi stoğu. */
    businessQty?: Record<string, number>;
  }) {
    const credits: Credit[] = [];
    const debits: Credit[] = [];

    const platesService = {
      findOne: jest.fn((id: string) =>
        Promise.resolve(plate(id, opts.businessQty?.[id] ?? 0)),
      ),
      consignmentOwners: jest.fn((ids: string[]) =>
        Promise.resolve(
          new Map(
            ids
              .map((id) => [id, opts.owners?.[id] ?? []] as const)
              .filter(([, o]) => o.length > 0),
          ),
        ),
      ),
      consume: jest.fn(() =>
        Promise.resolve({ widthReducedMm: 0, heightReducedMm: 0 }),
      ),
    };

    const accountService = {
      applyDebit: jest.fn((_m: EntityManager, mv: Credit) => {
        debits.push({ customerId: mv.customerId, amount: mv.amount });
        return Promise.resolve(mv.amount);
      }),
      applyCredit: jest.fn((_m: EntityManager, mv: Credit) => {
        credits.push({ customerId: mv.customerId, amount: mv.amount });
        return Promise.resolve(-mv.amount);
      }),
    };

    const service = new SalesService(
      {} as never, // salesRepo (persist kullanmıyor)
      platesService as never,
      { forPlates: jest.fn(async () => ({})) } as never, // pricingService
      { findOne: jest.fn(), resolveDefault: jest.fn(() => ({ id: 'wh-1' })) } as never,
      {
        baseCurrency: 'TRY',
        convert: jest.fn((amount: number) =>
          Promise.resolve({ amount, rate: 1 }),
        ),
      } as never,
      { findOne: jest.fn(() => Promise.resolve({ id: 'x' })) } as never,
      accountService as never,
      { emit: jest.fn() } as never,
      {} as never,
      { get: jest.fn(() => undefined) } as never,
    );

    const manager = {
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn((data: Record<string, unknown>) =>
        Promise.resolve({ id: 'sale-0000-1111', ...data }),
      ),
    } as unknown as EntityManager;

    return { service, manager, credits, debits, platesService, accountService };
  }

  /** İki kalem, ikisi de elle konsinye işaretli → sahip TOPLAM tutarla alacaklanır. */
  it('elle işaretlenen tüm konsinye kalemlerin payını toplar', async () => {
    const { service, manager, credits, debits } = buildService({
      owners: { [PLATE_A]: [OWNER], [PLATE_B]: [OWNER] },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      ownerCustomerId: OWNER,
      items: [
        {
          plateId: PLATE_A,
          quantity: 1,
          unitPrice: 1000,
          stockSource: SaleStockSource.CONSIGNMENT_TRACKED,
          ownerSettlement: OwnerSettlementType.COMMISSION_PERCENT,
          commissionPercent: 0,
        },
        {
          plateId: PLATE_B,
          quantity: 1,
          unitPrice: 500,
          stockSource: SaleStockSource.CONSIGNMENT_TRACKED,
          ownerSettlement: OwnerSettlementType.COMMISSION_PERCENT,
          commissionPercent: 0,
        },
      ],
    };

    const { result } = await service.persist(manager, dto, 'user-1');

    expect(debits).toEqual([{ customerId: BUYER, amount: 1500 }]);
    expect(credits).toEqual([{ customerId: OWNER, amount: 1500 }]);
    expect(result.sale.ownerAmount).toBe(1500);
  });

  /**
   * REGRESYON: kalemler "işletme stoğu" olarak gelse de malzemeler müşteriye
   * aitse ikisi de konsinye sayılır → sahip iki kalemin toplamıyla alacaklanır
   * (önceden yalnızca elle işaretlenen tek kalem yansıyordu).
   */
  it('müşteriye ait malzemeleri işletme stoğu gelse de sahibine yansıtır', async () => {
    const { service, manager, credits } = buildService({
      owners: { [PLATE_A]: [OWNER], [PLATE_B]: [OWNER] },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      items: [
        {
          plateId: PLATE_A,
          quantity: 1,
          unitPrice: 1000,
          stockSource: SaleStockSource.BUSINESS,
        },
        {
          plateId: PLATE_B,
          quantity: 2,
          unitPrice: 250,
          stockSource: SaleStockSource.BUSINESS,
        },
      ],
    };

    const { result, event } = await service.persist(manager, dto, 'user-1');

    expect(credits).toEqual([{ customerId: OWNER, amount: 1500 }]);
    expect(result.sale.ownerCustomerId).toBe(OWNER);
    expect(event.ownerCustomerId).toBe(OWNER);
    // Komisyon verilmediğinde satışın tamamı sahibe geçer, işletme kârı 0.
    expect(result.sale.businessMargin).toBe(0);
  });

  /** Komisyon yüzdesi verilen kalemde yalnızca komisyon işletmede kalır. */
  it('komisyonlu kalemde sahibe komisyon düşülmüş tutar yansır', async () => {
    const { service, manager, credits } = buildService({
      owners: { [PLATE_A]: [OWNER], [PLATE_B]: [OWNER] },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      ownerCustomerId: OWNER,
      items: [
        {
          plateId: PLATE_A,
          quantity: 1,
          unitPrice: 1000,
          stockSource: SaleStockSource.CONSIGNMENT_TRACKED,
          ownerSettlement: OwnerSettlementType.COMMISSION_PERCENT,
          commissionPercent: 10,
        },
        // İşaretsiz kalem: sahibi stoktan bulunur, komisyonsuz (tamamı sahibe).
        { plateId: PLATE_B, quantity: 1, unitPrice: 500 },
      ],
    };

    await service.persist(manager, dto, 'user-1');

    expect(credits).toEqual([{ customerId: OWNER, amount: 900 + 500 }]);
  });

  /** İşletmenin de stoğu olan kalem belirsizdir → sahibine yansıtılmaz. */
  it('işletme stoğu bulunan malzemeyi otomatik konsinyeye çevirmez', async () => {
    const { service, manager, credits } = buildService({
      owners: { [PLATE_A]: [OWNER] },
      businessQty: { [PLATE_A]: 5 },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      items: [
        {
          plateId: PLATE_A,
          quantity: 1,
          unitPrice: 1000,
          stockSource: SaleStockSource.BUSINESS,
        },
      ],
    };

    const { result } = await service.persist(manager, dto, 'user-1');

    expect(credits).toEqual([]);
    expect(result.sale.ownerAmount).toBe(0);
  });

  /** Farklı müşterilere ait malzemeler tek satışa sığmaz (tek sahip modeli). */
  it('farklı sahiplere ait malzemeler aynı satışta reddedilir', async () => {
    const OTHER = '33333333-3333-3333-3333-333333333333';
    const { service, manager } = buildService({
      owners: { [PLATE_A]: [OWNER], [PLATE_B]: [OTHER] },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      items: [
        { plateId: PLATE_A, quantity: 1, unitPrice: 100 },
        { plateId: PLATE_B, quantity: 1, unitPrice: 100 },
      ],
    };

    await expect(service.persist(manager, dto, 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /** Konsinye kalemlerin stoğu SAHİBİNDEN düşer (işletme stoğundan değil). */
  it('otomatik konsinye kalemde stok sahibin hesabından düşer', async () => {
    const { service, manager, platesService } = buildService({
      owners: { [PLATE_A]: [OWNER] },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      items: [
        {
          plateId: PLATE_A,
          quantity: 3,
          unitPrice: 100,
          stockSource: SaleStockSource.BUSINESS,
        },
      ],
    };

    await service.persist(manager, dto, 'user-1');

    expect(platesService.consume).toHaveBeenCalledWith(
      expect.objectContaining({ plateId: PLATE_A, ownerCustomerId: OWNER }),
    );
  });

  /** Alıcının borcu her zaman satışın tamamı kadar artar. */
  it('alıcı satışın tamamı kadar borçlanır', async () => {
    const { service, manager, debits } = buildService({
      owners: { [PLATE_A]: [OWNER] },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      items: [{ plateId: PLATE_A, quantity: 4, unitPrice: 125 }],
    };

    await service.persist(manager, dto, 'user-1');

    expect(debits).toEqual([
      expect.objectContaining({ customerId: BUYER, amount: 500 }),
    ]);
  });

  /** Defter hareketleri satışa bağlanır (satış geri alınınca temizlenebilsin). */
  it('alıcı borcunu ve sahip payını satış kaynağına bağlar', async () => {
    const { service, manager, accountService } = buildService({
      owners: { [PLATE_A]: [OWNER] },
    });
    const dto: CreateSaleDto = {
      buyerCustomerId: BUYER,
      items: [{ plateId: PLATE_A, quantity: 1, unitPrice: 100 }],
    };

    const { result } = await service.persist(manager, dto, 'user-1');

    for (const call of [
      accountService.applyDebit.mock.calls[0],
      accountService.applyCredit.mock.calls[0],
    ]) {
      expect(call[1]).toMatchObject({
        sourceType: LedgerSourceType.SALE,
        sourceId: result.sale.id,
      });
    }
  });
});
