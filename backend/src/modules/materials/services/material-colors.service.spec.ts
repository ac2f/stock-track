import { BadRequestException, ConflictException } from '@nestjs/common';
import { MaterialColorsService } from './material-colors.service';

/**
 * Aynı adlı renk farklı kodla (Beyaz 1001 / Beyaz 2002) ya da farklı markada
 * ayrı kayıttır; aynı ad + kod + marka tekrar açılmaz.
 */
describe('MaterialColorsService', () => {
  function build() {
    const rows: Record<string, any>[] = [];
    const repo = {
      find: jest.fn(async ({ where }: { where: { categoryId?: string } }) =>
        rows.filter((r) => !where.categoryId || r.categoryId === where.categoryId),
      ),
      findOne: jest.fn(async ({ where: { id } }) => rows.find((r) => r.id === id) ?? null),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => {
        if (!x.id) {
          x.id = `c${rows.length + 1}`;
          rows.push(x);
        }
        return x;
      }),
      update: jest.fn(async (id, patch) => Object.assign(rows.find((r) => r.id === id)!, patch)),
    };
    const counts = { count: jest.fn(async () => 0), update: jest.fn() };
    const brands = {
      findOne: jest.fn(async ({ where: { id } }) =>
        ({ akp: { id: 'akp', categoryId: 'pleksi' }, plx: { id: 'plx', categoryId: 'pleksi' }, dek: { id: 'dek', categoryId: 'dekota' } } as Record<string, unknown>)[id] ?? null,
      ),
    };
    return { service: new MaterialColorsService(repo as never, counts as never, counts as never, brands as never), rows };
  }

  it('aynı ad farklı kodla ikinci renk olur; aynısı tekrar açılmaz', async () => {
    const { service, rows } = build();
    const a = await service.create({ categoryId: 'pleksi', name: 'Beyaz', code: '1001' });
    const b = await service.create({ categoryId: 'pleksi', name: 'beyaz ', code: '2002' });
    const again = await service.create({ categoryId: 'pleksi', name: 'BEYAZ', code: ' 1001 ' });
    expect(a.id).not.toBe(b.id);
    expect(again.id).toBe(a.id);
    expect(rows).toHaveLength(2);
  });

  it('aynı ad ve kod farklı markada ayrı renktir', async () => {
    const { service, rows } = build();
    await service.create({ categoryId: 'pleksi', name: 'Beyaz', code: '1001', brandId: 'akp' });
    await service.create({ categoryId: 'pleksi', name: 'Beyaz', code: '1001', brandId: 'plx' });
    expect(rows).toHaveLength(2);
  });

  it('başka malzeme türünün markası reddedilir', async () => {
    const { service } = build();
    await expect(
      service.create({ categoryId: 'pleksi', name: 'Beyaz', brandId: 'dek' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('düzenlerken başka bir rengin aynısına dönüştürmeyi reddeder', async () => {
    const { service } = build();
    await service.create({ categoryId: 'pleksi', name: 'Beyaz', code: '1001' });
    const b = await service.create({ categoryId: 'pleksi', name: 'Beyaz', code: '2002' });
    await expect(service.update(b.id, { code: '1001' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('stok girişinde kod ve markaya göre doğru rengi seçer', async () => {
    const { service, rows } = build();
    const akp = await service.create({ categoryId: 'pleksi', name: 'Beyaz', code: '1001', brandId: 'akp' });
    const plx = await service.create({ categoryId: 'pleksi', name: 'Beyaz', code: '1001', brandId: 'plx' });
    expect((await service.findOrCreateByName('pleksi', 'beyaz', '1001', 'plx')).id).toBe(plx.id);
    expect((await service.findOrCreateByName('pleksi', 'beyaz', '1001', 'akp')).id).toBe(akp.id);
    // yeni kod: o markaya bağlı yeni renk açılır
    const n = await service.findOrCreateByName('pleksi', 'Beyaz', '3003', 'akp');
    expect(n).toMatchObject({ code: '3003', brandId: 'akp' });
    // kodsuz ve birden çok aday: hangisi olduğu bilinmediğinden kodsuz genel renk
    const generic = await service.findOrCreateByName('pleksi', 'Beyaz', undefined, 'akp');
    expect(generic.code ?? null).toBeNull();
    expect(rows).toHaveLength(4);
  });
});
