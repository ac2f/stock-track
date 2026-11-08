import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { allocatePlateSkus, formatSku, skuPrefix } from './plate-sku.util';

const SHOP = '00000000-0000-4000-8000-000000000001';

/** Sayaç + (varsa) dolu kodlar sahte; çağrıları sayar. */
function fakeManager(opts: { start?: number; taken?: (skus: string[]) => string[] } = {}) {
  let counter = opts.start ?? 0;
  const calls: string[] = [];
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('shop_counters')) {
        calls.push('counter');
        counter += Number(params[1]);
        return [{ value: String(counter) }];
      }
      calls.push('check');
      const skus = params[1] as string[];
      return (opts.taken?.(skus) ?? []).map((sku) => ({ sku }));
    }),
  };
  return { manager: manager as unknown as EntityManager, calls, query: manager.query };
}

describe('stok kodu', () => {
  it('önek: tür kodundan büyük harf/rakam, en çok 10 karakter; yoksa STK', () => {
    expect(skuPrefix('aluminum_composite')).toBe('ALUMINUMCO');
    expect(skuPrefix('pleksi')).toBe('PLEKSI');
    expect(skuPrefix('')).toBe('STK');
    expect(skuPrefix(undefined)).toBe('STK');
    expect(skuPrefix('--')).toBe('STK');
  });

  it('biçim: TÜR-000042 (kısa; marka/renk/ebat tekrar yazılmaz)', () => {
    expect(formatSku('PLEKSI', 42)).toBe('PLEKSI-000042');
    expect(formatSku('MDF', 1234567)).toBe('MDF-1234567');
    expect(formatSku('PLEKSI', 42).length).toBeLessThan(20);
  });

  it('N kod TEK sayaç güncellemesi + TEK çakışma sorgusuyla ayrılır (eski yöntem N² sorguydu)', async () => {
    const { manager, calls } = fakeManager({ start: 10 });
    const skus = await allocatePlateSkus(manager, SHOP, 'pleksi', 30);
    expect(skus).toHaveLength(30);
    expect(new Set(skus).size).toBe(30);
    expect(skus[0]).toBe('PLEKSI-000011');
    expect(skus[29]).toBe('PLEKSI-000040');
    expect(calls).toEqual(['counter', 'check']);
  });

  it('ardışık çağrılar çakışmaz (sayaç ilerler)', async () => {
    const { manager } = fakeManager();
    const a = await allocatePlateSkus(manager, SHOP, 'mdf', 3);
    const b = await allocatePlateSkus(manager, SHOP, 'mdf', 2);
    expect(a).toEqual(['MDF-000001', 'MDF-000002', 'MDF-000003']);
    expect(b).toEqual(['MDF-000004', 'MDF-000005']);
  });

  it('elle girilmiş/eski bir kodla çakışırsa sayaç ilerler ve yeni aralık alınır', async () => {
    const { manager, calls } = fakeManager({ taken: (skus) => skus.filter((s) => s === 'PLEKSI-000002') });
    const skus = await allocatePlateSkus(manager, SHOP, 'pleksi', 2);
    expect(skus).toEqual(['PLEKSI-000003', 'PLEKSI-000004']);
    expect(calls).toEqual(['counter', 'check', 'counter', 'check']);
  });

  it('sürekli çakışırsa sonsuz döngüye girmez: ConflictException', async () => {
    const { manager } = fakeManager({ taken: (skus) => skus });
    await expect(allocatePlateSkus(manager, SHOP, 'pleksi', 1)).rejects.toThrow(ConflictException);
  });

  it('0 kod istenirse veritabanına hiç gidilmez', async () => {
    const { manager, query } = fakeManager();
    await expect(allocatePlateSkus(manager, SHOP, 'x', 0)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('sayaç işletme kimliğiyle ve çakışma denetimi işletmeye süzülerek çalışır', async () => {
    const { manager, query } = fakeManager();
    await allocatePlateSkus(manager, SHOP, 'x', 1);
    expect(query.mock.calls[0][1][0]).toBe(SHOP);
    expect(query.mock.calls[1][0]).toContain('shop_id = $1');
    expect(query.mock.calls[1][1][0]).toBe(SHOP);
  });
});
