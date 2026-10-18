import { CorelService } from './corel.service';

/**
 * Malzeme listesinin sırası: müşteri kendi malzemesini getirdiyse en üstte
 * o görünür, ardından işletme stoğu. Arama ikisine de uygulanır.
 */
describe('CorelService', () => {
  const pleksi = (id: string, color: string, extra = {}) => ({
    id,
    name: `Pleksi ${color}`,
    brand: 'Akpolimer',
    color,
    variant: 'Dökme',
    thicknessMm: '2.80',
    widthMm: '1220.00',
    heightMm: '2440.00',
    quantityInStock: '4.00',
    template: { name: 'Pleksi', category: { name: 'Pleksi' } },
    ...extra,
  });

  function build(opts: {
    owned?: { plate_id: string; qty: string }[];
    ownedPlates?: unknown[];
    business?: unknown[];
    customers?: unknown[];
    quotes?: unknown[];
  }) {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(() => Promise.resolve(opts.owned ?? [])),
    };
    const platesRepo = {
      find: jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(
            opts.owned?.length
              ? (opts.ownedPlates ?? [])
              : (opts.business ?? []),
          ),
        )
        .mockImplementationOnce(() => Promise.resolve(opts.business ?? [])),
    };
    const customersRepo = {
      find: jest.fn(() => Promise.resolve(opts.customers ?? [])),
      findOne: jest.fn(() => Promise.resolve(null)),
    };
    const stockLevelsRepo = { createQueryBuilder: jest.fn(() => qb) };
    const quotesRepo = {
      find: jest.fn(() => Promise.resolve(opts.quotes ?? [])),
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          (opts.quotes as { id: string }[] | undefined)?.find(
            (q) => q.id === where.id,
          ) ?? null,
        ),
      ),
    };
    const settings = {
      getBusiness: jest.fn(() => Promise.resolve({ name: 'Acme Reklam' })),
    };
    return new CorelService(
      customersRepo as never,
      platesRepo as never,
      stockLevelsRepo as never,
      quotesRepo as never,
      settings as never,
    );
  }

  const lines = (body: string) =>
    body
      .trim()
      .split('\n')
      .filter((l) => !l.startsWith('#'));

  it('müşterinin malzemesi işletme stoğundan önce gelir', async () => {
    const svc = build({
      owned: [{ plate_id: 'm1', qty: '2.00' }],
      ownedPlates: [pleksi('m1', 'Siyah')],
      business: [pleksi('b1', 'Beyaz'), pleksi('b2', 'Kırmızı')],
    });

    const out = lines(
      await svc.materials('11111111-1111-1111-1111-111111111111'),
    );

    expect(out.map((l) => l.split('\t').slice(0, 2))).toEqual([
      ['m1', 'C'],
      ['b1', 'B'],
      ['b2', 'B'],
    ]);
    expect(out[0].split('\t')[9]).toBe('2');
    expect(out[1].split('\t')[9]).toBe('4');
  });

  it('arama Türkçe harfe duyarsızdır', async () => {
    const svc = build({
      business: [pleksi('b1', 'Beyaz'), pleksi('b2', 'Kırmızı')],
    });

    const out = lines(await svc.materials(undefined, 'kirmizi'));

    expect(out).toHaveLength(1);
    expect(out[0].split('\t')[6]).toBe('kirmizi');
  });

  it('müşteri aramasında adı aranan metinle başlayan önce gelir', async () => {
    const svc = build({
      customers: [
        { id: 'c1', name: 'Mehmet', companyName: 'Yıldız Öztürk Tabela' },
        { id: 'c2', name: 'Ayşe', companyName: 'Öztürk Reklam' },
        { id: 'c3', name: 'Can', companyName: 'Mavi Ajans' },
      ],
    });

    const out = lines(await svc.customers('ozturk'));

    expect(out.map((l) => l.split('\t')[0])).toEqual(['c2', 'c1']);
    expect(out[0].split('\t')[1]).toBe('ozturk-reklam');
  });

  it('teklif kullanımı yalnız tabaka kalemlerini verir', async () => {
    const sheet = { ...pleksi('p1', 'Beyaz'), measurementType: 'area' };
    const roll = { ...pleksi('p2', 'Profil'), measurementType: 'length' };
    const svc = build({
      quotes: [
        {
          id: 'q1',
          quoteNo: 'TKF-2026-0001',
          status: 'draft',
          createdAt: new Date('2026-10-17T10:00:00Z'),
          items: [
            {
              id: 'i1',
              quantity: '1',
              widthMm: '1220',
              heightMm: '900',
              plate: sheet,
            },
            { id: 'i2', quantity: '3', plate: roll },
            { id: 'i3', quantity: '1', plate: null, itemName: 'Montaj' },
          ],
        },
      ],
    });

    const qs = lines(await svc.quotes('c1'));
    expect(qs).toEqual(['q1\tTKF-2026-0001\t2026-10-17\tdraft\t1']);

    const used = lines(await svc.quoteUsage('q1'));
    expect(used).toHaveLength(1);
    expect(used[0].split('\t').slice(0, 3)).toEqual(['i1', 'Q', 'pleksi']);
    expect(used[0].split('\t').slice(7, 9)).toEqual(['1220', '900']);
  });

  it('işe dönüşen teklif: tabakanın dönüşümden önceki tam ölçüsü ve klasör adı', async () => {
    // Dönüşüm plakanın kalan boyunu 2440'tan 1540'a düşürdü; kalemde
    // kaydedilen tabaka ölçüsü geçer.
    const cut = { ...pleksi('p1', 'Beyaz', { heightMm: '1540.00' }), measurementType: 'area' };
    const roll = { ...pleksi('p2', 'Profil'), measurementType: 'length' };
    const svc = build({
      quotes: [
        {
          id: 'q1',
          quoteNo: 'TKF-2026-0007',
          status: 'converted',
          buyerCustomerId: 'c1',
          buyerCustomer: { name: 'Ali Veli', companyName: 'Öztürk Reklam' },
          createdAt: new Date('2026-10-17T10:00:00Z'),
          convertedAt: new Date('2026-10-18T08:30:00Z'),
          items: [
            {
              id: 'i1',
              quantity: '2',
              widthMm: '1220',
              heightMm: '900',
              sheetWidthMm: '1220.00',
              sheetHeightMm: '2440.00',
              plate: cut,
            },
            { id: 'i2', quantity: '3', plate: roll },
          ],
        },
      ],
    });

    const [job] = await svc.jobs('2026-10-18T00:00:00Z');
    expect(job).toMatchObject({
      id: 'q1',
      quoteNo: 'TKF-2026-0007',
      convertedAt: '2026-10-18T08:30:00.000Z',
      customerFolder: 'ozturk-reklam',
      customerLabel: 'Ozturk Reklam (Ali Veli)',
    });
    expect(job.sheets).toEqual([
      {
        itemId: 'i1',
        label: 'Pleksi 2.8mm Akpolimer Dokme Beyaz 1220x2440',
        kind: 'pleksi',
        thicknessUm: '2800',
        brand: 'akpolimer',
        variant: 'dokme',
        color: 'beyaz',
        sheetWidthMm: 1220,
        sheetHeightMm: 2440,
        usedWidthMm: 1220,
        usedHeightMm: 900,
        quantity: 2,
      },
    ]);
  });

  it('teklif listesi müşteri ister', async () => {
    await expect(build({}).quotes(undefined)).rejects.toThrow('customerId');
  });

  it('ping işletme adını döner', async () => {
    await expect(build({}).ping()).resolves.toBe(
      '#ac2f-corel 1\nok\tAcme Reklam\n',
    );
  });
});
