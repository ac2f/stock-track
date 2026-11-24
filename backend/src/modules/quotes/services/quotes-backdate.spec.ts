import { BadRequestException } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';

/**
 * Geriye dönük giriş yardımcıları: teklif içinde tanımlanan "yeni malzeme"nin
 * stoğa eklenip kaleme bağlanması ve kaydederken tek adımda kabul+dönüştürme.
 */
describe('QuotesService geriye dönük giriş', () => {
  function build() {
    const createBatch = jest.fn((_dto: { items: Record<string, unknown>[] }) =>
      Promise.resolve({ plateIds: ['plate-new'] }),
    );
    const update = jest.fn(() => Promise.resolve());
    const itemUpdate = jest.fn(() => Promise.resolve());
    const convert = jest.fn(() =>
      Promise.resolve({
        quote: { id: 'q1' },
        saleId: 'sale1',
        processingJobIds: ['j1', 'j2'],
      }),
    );
    const fake = {
      plateIntake: { createBatch },
      quotesRepo: { update },
      itemsRepo: { update: itemUpdate },
      convert,
    };
    const svc = fake as unknown as QuotesService;
    const priv = QuotesService.prototype as unknown as {
      materializePending: (quote: unknown) => Promise<void>;
      finalizeIfAsked: (q: unknown, dto: unknown, userId?: string) => Promise<Record<string, unknown>>;
    };
    return {
      createBatch,
      update,
      itemUpdate,
      convert,
      materialize: (quote: unknown) => priv.materializePending.call(svc, quote),
      finalize: (q: unknown, dto: unknown, userId?: string) =>
        priv.finalizeIfAsked.call(svc, q, dto, userId),
    };
  }

  /** Teklif kaydedilirken stoğa dokunulmaz; kabulde (materializePending) eklenir. */
  describe('newMaterial (kabulde stoğa)', () => {
    it('bekleyen malzeme yoksa stoğa dokunulmaz', async () => {
      const t = build();
      await t.materialize({ items: [{ id: 'i1', plateId: 'p1', quantity: 1 }] });
      expect(t.createBatch).not.toHaveBeenCalled();
    });

    it('bekleyen malzeme tek parça olarak stoğa eklenir ve kalemin plakası olur', async () => {
      const t = build();
      const pending = {
        id: 'i2',
        plateId: null,
        plate: null,
        itemName: 'Pleksi',
        quantity: 1,
        newMaterial: { templateId: 'tpl', widthMm: 100, heightMm: 200, quantityInStock: 1, copies: 5 },
      };
      const quote = { quoteDate: new Date('2026-03-02T00:00:00Z'), items: [{ id: 'i1', plateId: 'p1', quantity: 1 }, pending] };
      await t.materialize(quote);
      expect(t.createBatch).toHaveBeenCalledTimes(1);
      const sent = t.createBatch.mock.calls[0][0].items[0];
      expect(sent).toMatchObject({ templateId: 'tpl', widthMm: 100, heightMm: 200, copies: 1 });
      // Geliş tarihi verilmediyse teklif tarihi.
      expect(sent.addedAt).toBe('2026-03-02');
      expect(t.itemUpdate).toHaveBeenCalledWith('i2', { plateId: 'plate-new', newMaterial: null, itemName: null });
      // İlişki de bağlanır: eager `plate: null` cascade kayıtta plate_id'yi boşaltmasın.
      expect(pending).toMatchObject({ plateId: 'plate-new', newMaterial: null, plate: { id: 'plate-new' } });
      // İdempotent: ikinci kabulde yeniden eklenmez.
      await t.materialize(quote);
      expect(t.createBatch).toHaveBeenCalledTimes(1);
    });

    it('açıkça verilen geliş tarihi teklif tarihini ezer', async () => {
      const t = build();
      await t.materialize({
        quoteDate: new Date('2026-03-02T00:00:00Z'),
        items: [{ id: 'i1', quantity: 1, newMaterial: { templateId: 'tpl', addedAt: '2026-02-10' } }],
      });
      expect(t.createBatch.mock.calls[0][0].items[0].addedAt).toBe('2026-02-10');
    });
  });

  describe('finalize', () => {
    it('istenmediyse teklif olduğu gibi döner', async () => {
      const t = build();
      const q = { id: 'q1' };
      expect(await t.finalize(q, {}, 'u1')).toBe(q);
      expect(t.convert).not.toHaveBeenCalled();
    });

    it('kullanıcı yoksa reddeder', async () => {
      const t = build();
      await expect(t.finalize({ id: 'q1' }, { finalize: 'convert' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('complete: kabul eder, işleri tamamlanmış dönüştürür ve özet verir', async () => {
      const t = build();
      const out = await t.finalize({ id: 'q1' }, { finalize: 'complete' }, 'u1');
      expect(t.update).toHaveBeenCalledWith('q1', { status: QuoteStatus.ACCEPTED });
      expect(t.convert).toHaveBeenCalledWith('q1', 'u1', { completeProcessing: true });
      expect(out.conversion).toEqual({ saleId: 'sale1', processingJobIds: ['j1', 'j2'], completed: true });
    });

    it('convert: işler kuyrukta kalır', async () => {
      const t = build();
      const out = await t.finalize({ id: 'q1' }, { finalize: 'convert' }, 'u1');
      expect(t.convert).toHaveBeenCalledWith('q1', 'u1', { completeProcessing: false });
      expect((out.conversion as { completed: boolean }).completed).toBe(false);
    });
  });
});
