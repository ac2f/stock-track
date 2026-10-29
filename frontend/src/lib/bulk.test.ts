import { describe, expect, it } from 'vitest';
import { bulkReport, runBulk } from './bulk';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, plateId: `p${i % 2}` }));
const apiErr = (message: string) => ({ response: { data: { message } } });
const tick = () => new Promise((r) => setTimeout(r, 1));

describe('runBulk', () => {
  it('başarılıları ve nedeniyle başarısızları ayırır; biri düşse diğerleri sürer', async () => {
    const res = await runBulk(
      items(5),
      async (it) => {
        if (it.id === 'id1') throw apiErr('Stok yetersiz');
        if (it.id === 'id3') throw new Error('x');
      },
      { label: (it) => `iş ${it.id}` },
    );
    expect(res.okIds.sort()).toEqual(['id0', 'id2', 'id4']);
    expect(res.failed.map((f) => [f.id, f.label, f.reason]).sort()).toEqual([
      ['id1', 'iş id1', 'Stok yetersiz'],
      ['id3', 'iş id3', 'Uygulanamadı.'],
    ]);
  });

  it('aynı serialKey sırayla, farklı anahtarlar eşzamanlı çalışır', async () => {
    const log: string[] = [];
    let running = 0;
    const maxByKey: Record<string, number> = {};
    const active: Record<string, number> = {};
    let peak = 0;
    await runBulk(
      items(6),
      async (it) => {
        running++;
        peak = Math.max(peak, running);
        active[it.plateId] = (active[it.plateId] ?? 0) + 1;
        maxByKey[it.plateId] = Math.max(maxByKey[it.plateId] ?? 0, active[it.plateId]);
        log.push(it.id);
        await tick();
        active[it.plateId]--;
        running--;
      },
      { serialKey: (it) => it.plateId },
    );
    expect(maxByKey).toEqual({ p0: 1, p1: 1 });
    expect(peak).toBe(2);
    expect(log).toHaveLength(6);
  });

  it('eşzamanlılık sınırına uyar', async () => {
    let running = 0;
    let peak = 0;
    await runBulk(
      items(12),
      async () => {
        running++;
        peak = Math.max(peak, running);
        await tick();
        running--;
      },
      { concurrency: 3 },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('boş listede hiçbir şey çağırmaz', async () => {
    const res = await runBulk([], async () => {
      throw new Error('çağrılmamalı');
    });
    expect(res).toEqual({ okIds: [], failed: [] });
  });
});

describe('bulkReport', () => {
  const verbs = { done: 'tamamlandı', notDone: 'tamamlanamadı' };
  it('hepsi başarılı', () => {
    expect(bulkReport('iş', verbs, { okIds: ['a', 'b'], failed: [] })).toEqual({
      tone: 'success',
      title: '2 iş tamamlandı',
    });
  });
  it('kısmi başarı: uyarı + ilk neden', () => {
    const r = bulkReport('iş', verbs, {
      okIds: ['a'],
      failed: [
        { id: 'b', label: 'Pleksi', reason: 'Stok yetersiz' },
        { id: 'c', label: 'Dekota', reason: 'Başka hata' },
      ],
    });
    expect(r.tone).toBe('warning');
    expect(r.title).toBe('1 iş tamamlandı, 2 iş tamamlanamadı');
    expect(r.detail).toBe('Pleksi: Stok yetersiz (+1 başka hata)');
  });
  it('hiçbiri olmadı: hata + aynı neden bir kez', () => {
    const r = bulkReport(
      'malzeme',
      { done: 'güncellendi', notDone: 'güncellenemedi' },
      {
        okIds: [],
        failed: [
          { id: 'a', label: 'A', reason: 'Yetkiniz yok' },
          { id: 'b', label: 'B', reason: 'Yetkiniz yok' },
        ],
      },
      3,
    );
    expect(r.tone).toBe('error');
    expect(r.title).toBe('2 malzeme güncellenemedi (3 malzeme atlandı)');
    expect(r.detail).toBe('A: Yetkiniz yok');
  });
});
