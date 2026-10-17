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
    const settings = {
      getBusiness: jest.fn(() => Promise.resolve({ name: 'Acme Reklam' })),
    };
    return new CorelService(
      customersRepo as never,
      platesRepo as never,
      stockLevelsRepo as never,
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
    expect(out[0].split('\t')[1]).toBe('Ozturk Reklam');
  });

  it('ping işletme adını döner', async () => {
    await expect(build({}).ping()).resolves.toBe(
      '#ac2f-corel 1\nok\tAcme Reklam\n',
    );
  });
});
