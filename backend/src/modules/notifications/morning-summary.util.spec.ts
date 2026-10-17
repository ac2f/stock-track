import { buildMorningSummary, plateText } from './morning-summary.util';

describe('Sabah özeti', () => {
  const base = {
    business: 'Acme Reklam',
    date: new Date('2026-10-25T05:00:00Z'),
    timeZone: 'Europe/Istanbul',
    jobs: [],
    needs: [],
    low: [],
    quotes: [],
  };

  it('boş günde bekleyen iş olmadığını söyler', () => {
    const t = buildMorningSummary(base);
    expect(t).toContain('Günaydın — 25.10.2026 Pazar');
    expect(t).toContain('Bekleyen iş yok.');
    expect(t).not.toContain('Gereken plakalar');
  });

  it('işleri makineye göre gruplar, eksik stoğu işaretler', () => {
    const t = buildMorningSummary({
      ...base,
      jobs: [
        {
          machine: 'CNC',
          customer: 'Öztürk',
          plate: 'Pleksi 2.8mm',
          quantity: 2,
          minutes: 30,
        },
        { machine: null, customer: null, plate: 'Dekota 5mm', quantity: 1 },
        {
          machine: 'CNC',
          customer: 'Mavi',
          plate: 'Pleksi 3mm',
          quantity: 1,
          minutes: 45,
        },
      ],
      needs: [
        { plate: 'Pleksi 2.8mm', needed: 2, inStock: 3 },
        { plate: 'Kompozit 4mm', needed: 3, inStock: 1 },
      ],
      low: [{ plate: 'Pleksi 5mm Siyah', inStock: 1, reorderLevel: 2 }],
      quotes: [
        {
          quoteNo: 'TKF-2026-0012',
          customer: 'Öztürk',
          total: 1250,
          currency: 'TRY',
        },
      ],
    });
    expect(t).toContain('Bekleyen işler (3) · toplam 75 dk');
    expect(t).toMatch(
      /CNC \(2\)\n• Öztürk — Pleksi 2\.8mm ×2 · 30 dk\n• Mavi — Pleksi 3mm ×1 · 45 dk/,
    );
    expect(t).toContain('Makinesiz (1)\n• Dekota 5mm ×1');
    expect(t).toContain('• Pleksi 2.8mm — 2 gerekli, stokta 3\n');
    expect(t).toContain('• Kompozit 4mm — 3 gerekli, stokta 1 ⚠️ 2 eksik');
    expect(t).toContain('• Pleksi 5mm Siyah — 1 (sipariş seviyesi 2)');
    expect(t).toContain('• TKF-2026-0012 · Öztürk · 1.250,00 TRY');
  });

  it('Telegram sınırını aşmaz', () => {
    const jobs = Array.from({ length: 300 }, (_, i) => ({
      machine: 'CNC',
      customer: `Müşteri ${i}`,
      plate: 'Pleksi 2.8mm Akpolimer Dökme Beyaz 1220x2440',
      quantity: 1,
    }));
    const needs = Array.from({ length: 300 }, (_, i) => ({
      plate: `Malzeme ${i} uzun bir ad ile`,
      needed: 2,
      inStock: 0,
    }));
    const t = buildMorningSummary({ ...base, jobs, needs });
    expect(t.length).toBeLessThanOrEqual(3902);
    expect(t).toContain('… ve 275 iş daha');
  });

  it('plaka adı tür, kalınlık, marka, varyant, renk ve ebattan', () => {
    expect(
      plateText({
        name: 'x',
        brand: 'Akpolimer',
        variant: 'Dökme',
        color: 'Beyaz',
        thicknessMm: '2.80',
        widthMm: '1220.00',
        heightMm: '2440.00',
        template: { category: { name: 'Pleksi' } },
      }),
    ).toBe('Pleksi 2.8mm Akpolimer Dökme Beyaz 1220x2440');
    expect(plateText(null)).toBe('Malzeme');
  });
});
