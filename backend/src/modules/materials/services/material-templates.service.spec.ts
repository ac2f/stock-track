import { ConflictException } from '@nestjs/common';
import { templateKey } from '../catalog-key.util';
import { MaterialTemplatesService } from './material-templates.service';

/**
 * Aynı ürün türü ikinci kez açılmaz: kategori + marka + renk + ebat +
 * kalınlık + alt tür aynıysa (ad farklı olsa da) reddedilir.
 */
describe('MaterialTemplatesService – kopya engeli', () => {
  const existing = {
    id: 't1',
    name: 'Pleksi Akpolimer[Beyaz] 2.8x1220x2440',
    categoryId: 'pleksi',
    defaultBrandId: 'b1',
    defaultColorId: 'c1',
    defaultSizeId: 's1',
    defaultThicknessId: 'k1',
    defaultVariant: 'Dökme',
  };

  function build(rows: Record<string, unknown>[] = [existing]) {
    const repo = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where: { id } }: { where: { id: string } }) =>
        rows.find((r) => r.id === id) ?? null,
      ),
      save: jest.fn(async (x: unknown) => x),
      create: jest.fn((x: unknown) => x),
      update: jest.fn(),
    };
    const catalog = { findOne: jest.fn(async () => ({ categoryId: 'pleksi' })) };
    const service = new MaterialTemplatesService(
      repo as never,
      catalog as never,
      catalog as never,
      catalog as never,
      catalog as never,
      catalog as never,
      {} as never,
    );
    return { service, repo };
  }

  it('aynı özellikleri farklı adla açmayı reddeder', async () => {
    const { service, repo } = build();
    await expect(
      service.create({
        name: 'Beyaz pleksi 2.8',
        categoryId: 'pleksi',
        defaultBrandId: 'b1',
        defaultColorId: 'c1',
        defaultSizeId: 's1',
        defaultThicknessId: 'k1',
        defaultVariant: ' dökme ',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('alt türü farklıysa ayrı üründür', async () => {
    const { service, repo } = build();
    await service.create({
      name: 'Pleksi çekme',
      categoryId: 'pleksi',
      defaultBrandId: 'b1',
      defaultColorId: 'c1',
      defaultSizeId: 's1',
      defaultThicknessId: 'k1',
      defaultVariant: 'Çekme',
    });
    expect(repo.save).toHaveBeenCalled();
  });

  it('düzenlerken başka bir türün aynısına dönüştürmeyi reddeder', async () => {
    const other = { ...existing, id: 't2', defaultColorId: 'c2' };
    const { service } = build([existing, other]);
    await expect(service.update('t2', { defaultColorId: 'c1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('kendi kaydını düzenlemek kopya sayılmaz', async () => {
    const { service, repo } = build();
    await service.update('t1', { description: 'not' });
    expect(repo.update).toHaveBeenCalled();
  });

  it('özelliği olmayan türlerde adı ayırt eder', () => {
    const a = templateKey({ categoryId: 'folyo', name: 'Folyo 641' });
    const b = templateKey({ categoryId: 'folyo', name: 'folyo  641 ' });
    const c = templateKey({ categoryId: 'folyo', name: 'Folyo 651' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
