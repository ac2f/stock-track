import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { PricingService } from './pricing.service';
import { PriceRulesService } from './price-rules.service';

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
    /** Etkin fiyat çatıları (girdileriyle). */
    rules?: Record<string, unknown>[];
    /** Satın almalardan alış maliyeti (m² başına). */
    unitCost?: number;
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
    // Gerçek çatı servisi: eşleşme ve referans seçimi gerçekten çalışsın.
    const rules = new PriceRulesService(
      { find: jest.fn(async () => opts.rules ?? []) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      currency as never,
    );
    const costs = {
      forPlates: jest.fn(async () =>
        opts.unitCost != null
          ? { p1: { plateId: 'p1', unitCost: opts.unitCost, purchaseUnitPrice: 0, currency: 'TRY', source: 'plate' } }
          : {},
      ),
    };
    return new PricingService(
      platesRepo as never,
      pricesRepo as never,
      settings as never,
      currency as never,
      rules,
      costs as never,
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

  describe('fiyat çatısı', () => {
    /** Pleksi 2.8 mm Akpolimer beyaz, 3050×1560 tabaka. */
    const PLEKSI = {
      template: {
        categoryId: 'pleksi',
        defaultSize: SHEET,
        defaultSizeId: 's1',
        defaultThicknessId: 't28',
        defaultThickness: { valueMm: 2.8 },
        defaultBrandId: 'akp',
        defaultBrand: { name: 'Akpolimer' },
        defaultColorId: 'beyaz',
        defaultColor: { name: 'Beyaz' },
      },
    };
    const rule = (o: Record<string, unknown>) => ({
      id: 'r',
      categoryId: 'pleksi',
      category: { name: 'Pleksi' },
      unit: PriceUnit.PER_M2,
      markupPercent: null,
      referenceEntryId: null,
      entries: [],
      ...o,
    });
    const entry = (id: string, price: number, currency = 'TRY', supplier = id) => ({
      id,
      price,
      currency,
      supplierId: supplier,
      supplier: { name: supplier },
      priceUpdatedAt: new Date('2026-10-01'),
    });

    it('kalem fiyatı yoksa çatının referans fiyatından önerir', async () => {
      const service = buildService({
        plate: PLEKSI,
        markup: 20,
        rules: [rule({ entries: [entry('e1', 500)] })],
      });

      const p = await service.forPlate('p1');

      expect(p.priceSource).toBe('rule');
      expect(p.basePrice).toBe(500);
      expect(p.suggestedUnitPrice).toBe(600);
      expect(p.rule?.label).toBe('Tüm Pleksi');
      expect(p.rule?.autoPicked).toBe(true);
    });

    it('dövizli malzemeci fiyatını son kurla çevirir', async () => {
      // 12 USD × 34 = 408 TL/m²
      const service = buildService({
        plate: PLEKSI,
        rate: 34,
        rules: [rule({ entries: [entry('e1', 12, 'USD')] })],
      });

      const p = await service.forPlate('p1');

      expect(p.basePrice).toBe(408);
      expect(p.rule?.currency).toBe('USD');
    });

    it('seçilen malzemecinin fiyatı referanstır, seçilmezse en ucuzu', async () => {
      const entries = [entry('ucuz', 400), entry('secilen', 450)];
      const auto = await buildService({
        plate: PLEKSI,
        rules: [rule({ entries })],
      }).forPlate('p1');
      const chosen = await buildService({
        plate: PLEKSI,
        rules: [rule({ entries, referenceEntryId: 'secilen' })],
      }).forPlate('p1');

      expect(auto.rule?.supplierName).toBe('ucuz');
      expect(chosen.rule?.supplierName).toBe('secilen');
      expect(chosen.rule?.autoPicked).toBe(false);
      expect(chosen.basePrice).toBe(450);
      // Çatıdaki fiyatlar piyasa karşılaştırmasına da girer.
      expect(chosen.marketCheapest).toBe(400);
    });

    it('en özel çatı geçerlidir', async () => {
      const service = buildService({
        plate: PLEKSI,
        rules: [
          rule({ id: 'tum', entries: [entry('a', 300)] }),
          rule({
            id: 'kalin',
            thicknessId: 't28',
            thickness: { valueMm: 2.8 },
            entries: [entry('b', 350)],
          }),
          rule({
            id: 'beyaz',
            colorId: 'beyaz',
            color: { name: 'Beyaz' },
            entries: [entry('c', 320)],
          }),
          rule({
            id: 'baska-renk',
            thicknessId: 't28',
            thickness: { valueMm: 2.8 },
            colorId: 'siyah',
            color: { name: 'Siyah' },
            entries: [entry('d', 999)],
          }),
        ],
      });

      const p = await service.forPlate('p1');

      // Kalınlık ile renk aynı sayıda alan: kalınlık fiyata daha çok etki eder.
      expect(p.rule?.id).toBe('kalin');
      expect(p.basePrice).toBe(350);
    });

    it('tabaka başına çatı fiyatını m² fiyatına çevirir', async () => {
      // 1000 TL/tabaka ÷ 4.758 m² = 210.17 TL/m²
      const service = buildService({
        plate: PLEKSI,
        rules: [rule({ unit: PriceUnit.PER_PLATE, sizeId: 's1', entries: [entry('e', 1000)] })],
      });

      const p = await service.forPlate('p1');

      expect(p.basePrice).toBeCloseTo(210.17, 1);
    });

    it('kalemin kendi fiyatı çatıdan önce gelir, çatı yine gösterilir', async () => {
      const service = buildService({
        plate: { ...PLEKSI, retailPrice: 100 },
        rules: [rule({ entries: [entry('e', 500)] })],
      });

      const p = await service.forPlate('p1');

      expect(p.priceSource).toBe('plate');
      expect(p.suggestedUnitPrice).toBe(100);
      expect(p.rule?.price).toBe(500);
    });

    it('çatının kâr yüzdesi genel oranı ezer, kaleminki çatınınkini', async () => {
      const ruleMarkup = await buildService({
        plate: PLEKSI,
        markup: 40,
        rules: [rule({ markupPercent: 10, entries: [entry('e', 100)] })],
      }).forPlate('p1');
      const plateMarkup = await buildService({
        plate: { ...PLEKSI, markupPercent: 5 },
        markup: 40,
        rules: [rule({ markupPercent: 10, entries: [entry('e', 100)] })],
      }).forPlate('p1');

      expect(ruleMarkup.suggestedUnitPrice).toBe(110);
      expect(plateMarkup.suggestedUnitPrice).toBe(105);
    });

    it('başka kategorinin çatısı uygulanmaz', async () => {
      const service = buildService({
        plate: PLEKSI,
        rules: [rule({ categoryId: 'dekota', entries: [entry('e', 100)] })],
      });

      const p = await service.forPlate('p1');

      expect(p.priceSource).toBeNull();
      expect(p.rule).toBeNull();
      expect(p.suggestedUnitPrice).toBeNull();
    });
  });

  it('alış maliyeti varsa önerilen fiyattaki kârı verir', async () => {
    const withCost = await buildService({ plate: { retailPrice: 130 }, unitCost: 100 }).forPlate('p1');
    const noCost = await buildService({ plate: { retailPrice: 130 } }).forPlate('p1');
    expect(withCost.cost?.unitCost).toBe(100);
    expect(withCost.marginPercent).toBe(30);
    expect(noCost.cost).toBeNull();
    expect(noCost.marginPercent).toBeNull();
  });
});
