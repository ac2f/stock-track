import { describe, expect, it } from 'vitest';
import { groupQueue, groupTotal } from './queueGroups';
import type { ProcessingJob, ProcessingQueueGroup } from '../types';

let seq = 0;
const job = (customer: string | null, category: string | null, template: string | null, cost = 100, currency = 'TRY'): ProcessingJob =>
  ({
    id: `j${++seq}`,
    plateId: `p${seq}`,
    plate: { name: `Plaka ${seq}`, template: template || category ? { name: template ?? undefined, category: category ? { name: category } : null } : null },
    customer: customer ? { name: customer } : undefined,
    status: 'pending',
    billingUnit: 'area',
    quantityValue: 1,
    totalCost: cost,
    currency,
    processedAt: '2026-01-01',
  }) as unknown as ProcessingJob;

const queue = (...groups: [string | null, string, ProcessingJob[]][]): ProcessingQueueGroup[] =>
  groups.map(([machineId, machineName, jobs]) => ({ machineId, machineName, jobs }));

describe('groupQueue', () => {
  const a = job('Zeynep', 'Dekota', 'Dekota 3 mm Beyaz');
  const b = job('Ali', 'Pleksi', 'Pleksi 5 mm Şeffaf');
  const c = job('Ali', 'Dekota', 'Dekota 3 mm Beyaz');
  const d = job(null, null, null);
  const q = queue(['m1', 'CNC', [a, b]], [null, 'Atanmamış', [c, d]]);

  it('makineye göre: sunucu gruplaması korunur, boş gruplar atlanır', () => {
    const g = groupQueue([...q, { machineId: 'm2', machineName: 'Boş', jobs: [] }], 'machine');
    expect(g.map((x) => x.title)).toEqual(['🛠️ CNC', '🛠️ Atanmamış']);
    expect(g[0].jobs).toEqual([a, b]);
  });

  it('müşteriye göre: Türkçe sıra, müşterisiz sonda', () => {
    const g = groupQueue(q, 'customer');
    expect(g.map((x) => [x.title, x.jobs.length])).toEqual([
      ['Ali', 2],
      ['Zeynep', 1],
      ['Müşterisiz', 1],
    ]);
  });

  it('ürün türüne (kategori) göre', () => {
    const g = groupQueue(q, 'category');
    expect(g.map((x) => [x.title, x.jobs.length])).toEqual([
      ['Dekota', 2],
      ['Pleksi', 1],
      ['Diğer', 1],
    ]);
  });

  it('malzemeye (şablon adı) göre; şablon yoksa plaka adına düşer', () => {
    const g = groupQueue(q, 'template');
    // Şablonu olmayan işin grubu plaka adıyla açılır ("Plaka 4" < "Pleksi…").
    expect(g.map((x) => x.title)).toEqual([
      'Dekota 3 mm Beyaz',
      d.plate!.name,
      'Pleksi 5 mm Şeffaf',
    ]);
    expect(g[0].jobs).toEqual([a, c]);
  });

  it('müşteri › ürün türü: iki düzeyli; üst düzey tüm işleri içerir', () => {
    const g = groupQueue(q, 'customer-category');
    const ali = g.find((x) => x.title === 'Ali')!;
    expect(ali.jobs).toHaveLength(2);
    expect(ali.children!.map((x) => [x.title, x.jobs.length])).toEqual([
      ['Dekota', 1],
      ['Pleksi', 1],
    ]);
    expect(g.flatMap((x) => x.children!.flatMap((y) => y.jobs))).toHaveLength(4);
  });

  it('işler gruplar arasında kaybolmaz ya da çoğalmaz', () => {
    for (const by of ['machine', 'customer', 'category', 'template', 'customer-category'] as const) {
      const ids = groupQueue(q, by).flatMap((g) => g.jobs.map((j) => j.id)).sort();
      expect(ids).toEqual([a, b, c, d].map((j) => j.id).sort());
    }
  });
});

describe('groupTotal', () => {
  it('tek para biriminde toplar, karışıkta null', () => {
    expect(groupTotal([job('A', null, null, 100), job('A', null, null, 50.5)])).toEqual({ total: 150.5, currency: 'TRY' });
    expect(groupTotal([job('A', null, null, 1), job('A', null, null, 1, 'USD')])).toBeNull();
  });
});
