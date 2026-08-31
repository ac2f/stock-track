import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { PricingService } from './pricing.service';

/**
 * Satış fiyatı = perakende × (1 + kâr%). Malzemeci fiyatlarıyla karşılaştırılır;
 * biz daha ucuzsak aradaki fark indirim yüzdesi olarak gösterilir.
 *
 * Tedarikçi fiyatı tabaka başına girildiğinde, m² bazlı malzemede standart
 * tabaka alanına bölünerek karşılaştırılabilir hale getirilir.
 */
describe('PricingService', () => {
  /** 3050×1560 tabaka = 4.758 m². */
  const SHEET = { widthMm: 3050, heightMm: 1560 };

  function buildService(opts: {
    plate?: Record<string, unknown>;
    prices?: { price: number; unit: PriceUnit }[];
    markup?: number;
    commission?: number;
    /** Baz para birimine çevrim katsayısı (ör. USD → 34 TL). */
    rate?: number;
  }) {
    const plate = {
      id: 'p1',
      measurementType: MeasurementType.AREA,
      template: { defaultSize: SHEET },
      ...opts.plate,
    };
    const platesRepo = { findOne: jest.fn(async () => plate), find: jest.fn() };
    const pricesRepo = {
      find: jest.fn(async () =>
        (opts.prices ?? []).map((p, i) => ({ ...p, plateId: 'p1', id: `x${i}` })),
      ),
      createQueryBuilder: jest.fn(),
    };
    const settings = {
      getPricing: jest.fn(async () => ({
        saleMarkupPercent: opts.markup ?? 0,
        consignmentCommissionPercent: opts.commission ?? 0,
      })),
    };
    const currency = {
      baseCurrency: 'TRY',
      toBase: jest.fn(async (amount: number) => amount * (opts.rate ?? 1)),
    };
    return new PricingService(
      platesRepo as never,
      pricesRepo as never,
      settings as never,
      currency as never,
    );
  }

  it('satış fiyatını perakende üzerine kâr ekleyerek önerir', async () => {
    const service = buildService({
      plate: { retailPrice: 100 },
      markup: 25,
    });

    const p = await service.forPlate('p1');

    expect(p.retailPrice).toBe(100);
    expect(p.markupPercent).toBe(25);
    expect(p.suggestedUnitPrice).toBe(125);
  });

  it('plakaya özel kâr yüzdesi genel ayarı ezer', async () => {
    const service = buildService({
      plate: { retailPrice: 100, markupPercent: 10 },
      markup: 40,
    });

    const p = await service.forPlate('p1');

    expect(p.markupPercent).toBe(10);
    expect(p.suggestedUnitPrice).toBe(110);
  });

  it('perakende fiyat yoksa öneri yapmaz', async () => {
    const service = buildService({ markup: 25 });

    const p = await service.forPlate('p1');

    expect(p.retailPrice).toBeNull();
    expect(p.suggestedUnitPrice).toBeNull();
    expect(p.discountPercent).toBeNull();
  });

  it('tabaka başına tedarikçi fiyatını m² fiyatına çevirir', async () => {
    // 1000 TL/tabaka ÷ 4.758 m² = 210.17 TL/m²
    const service = buildService({
      plate: { retailPrice: 100 },
      markup: 0,
      prices: [{ price: 1000, unit: PriceUnit.PER_PLATE }],
    });

    const p = await service.forPlate('p1');

    expect(p.marketCheapest).toBeCloseTo(210.17, 1);
  });

  it('piyasadan ucuzsak indirim yüzdesi verir', async () => {
    // Bizim m² fiyatımız 100, piyasanın en ucuzu 200 → %50 uygun.
    const service = buildService({
      plate: { retailPrice: 100 },
      markup: 0,
      prices: [{ price: 200, unit: PriceUnit.PER_M2 }],
    });

    const p = await service.forPlate('p1');

    expect(p.marketCheapest).toBe(200);
    expect(p.discountPercent).toBe(50);
  });

  it('piyasadan pahalıysak indirim göstermez', async () => {
    const service = buildService({
      plate: { retailPrice: 300 },
      markup: 0,
      prices: [{ price: 200, unit: PriceUnit.PER_M2 }],
    });

    const p = await service.forPlate('p1');

    expect(p.discountPercent).toBeNull();
  });

  it('en ucuz tedarikçiyi karşılaştırma tabanı alır', async () => {
    const service = buildService({
      plate: { retailPrice: 100 },
      markup: 0,
      prices: [
        { price: 260, unit: PriceUnit.PER_M2 },
        { price: 200, unit: PriceUnit.PER_M2 },
        { price: 320, unit: PriceUnit.PER_M2 },
      ],
    });

    const p = await service.forPlate('p1');

    expect(p.marketCheapest).toBe(200);
    expect(p.marketAverage).toBe(260);
    expect(p.discountPercent).toBe(50);
  });

  it('şerit malzemede yalnızca metre bazlı fiyatları karşılaştırır', async () => {
    const service = buildService({
      plate: {
        retailPrice: 40,
        measurementType: MeasurementType.LENGTH,
        template: { defaultSize: null },
      },
      markup: 0,
      prices: [
        { price: 50, unit: PriceUnit.PER_METER },
        // Tabaka fiyatı metre malzemeye uygulanamaz → hariç.
        { price: 999, unit: PriceUnit.PER_PLATE },
      ],
    });

    const p = await service.forPlate('p1');

    expect(p.marketCheapest).toBe(50);
    expect(p.discountPercent).toBe(20);
  });

  it('dövizle girilen perakende fiyatı baz para birimine çevirir', async () => {
    // 10 USD × 34 = 340 TL, %25 kâr → 425 TL
    const service = buildService({
      plate: { retailPrice: 10, retailCurrency: 'USD' },
      markup: 25,
      rate: 34,
    });

    const p = await service.forPlate('p1');

    expect(p.retailPrice).toBe(10);
    expect(p.retailCurrency).toBe('USD');
    expect(p.retailPriceBase).toBe(340);
    expect(p.suggestedUnitPrice).toBe(425);
    expect(p.baseCurrency).toBe('TRY');
  });

  it('konsinye komisyon oranını ayarlardan taşır', async () => {
    const service = buildService({ plate: { retailPrice: 10 }, commission: 15 });

    const p = await service.forPlate('p1');

    expect(p.commissionPercent).toBe(15);
  });
});
