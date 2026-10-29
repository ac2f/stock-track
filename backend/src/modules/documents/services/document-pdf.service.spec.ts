import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DocumentPdfService, describePdfError } from './document-pdf.service';
import { DocModel } from './document-model';
import { DocumentHtmlService } from './document-html.service';
import { DocumentsController } from '../documents.controller';

const business = {
  name: 'Çağlayan Tabela & Reklam',
  address: 'Şehit İsmail Sk. No:5 Kadıköy / İstanbul',
  phone: '0216 555 00 11',
  taxNo: '',
  logoPath: '',
  portalBaseUrl: '',
  defaultCurrency: 'TRY',
};

const rows = (n: number): (string | number)[][] =>
  Array.from({ length: n }, (_, i) => [
    '12.03.2026',
    `Satış · Işık ğüşöç İİ açıklaması ${i + 1} ${'uzun metin '.repeat(i % 7 === 0 ? 8 : 1)}`,
    i % 2 ? '1.250,00' : '',
    i % 2 ? '' : '300,00',
    `${(i + 1) * 10},00`,
  ]);

const model = (n: number): DocModel => ({
  business,
  docTitle: 'CARİ HESAP EKSTRESİ',
  pageTitle: 'Ekstre Şükrü Öztürk',
  meta: [
    ['Tarih', '29.10.2026'],
    ['Dönem', 'Tüm hareketler — bugün'],
  ],
  parties: [{ label: 'Cari', lines: ['Şükrü Öztürk', 'Tel: 0532 000 00 00'] }],
  sections: [
    {
      headers: ['Tarih', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'],
      aligns: ['left', 'left', 'right', 'right', 'right'],
      rows: rows(n),
      emphasizeLast: true,
      foot: [
        ['Dönem borç toplamı', '10,00 TRY'],
        ['Dönem sonu bakiye', '10,00 TRY'],
      ],
    },
  ],
});

const pages = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;

describe('DocumentPdfService', () => {
  const svc = new DocumentPdfService();

  it('geçerli bir A4 PDF üretir, Türkçe yazı tipi gömülüdür', async () => {
    const pdf = await svc.render(model(5));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    const txt = pdf.toString('latin1');
    expect(txt).toContain('LiberationSans');
    expect(txt).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(pages(pdf)).toBe(1);
  });

  it('uzun tablo birden çok sayfaya bölünür', async () => {
    const small = await svc.render(model(10));
    const big = await svc.render(model(120));
    expect(pages(small)).toBe(1);
    expect(pages(big)).toBeGreaterThanOrEqual(3);
  });

  it('boş tablo ve not ile de üretir', async () => {
    const m = model(0);
    m.note = 'Ödeme şartları: 30 gün vadeli.';
    const pdf = await svc.render(m);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
  });

  it('çok sütunlu ve sığmayan genişlikte bile çöker', async () => {
    const m = model(3);
    m.sections = [
      {
        headers: ['A', 'B', 'C', 'D', 'E', 'F'],
        rows: [
          ['x'.repeat(80), 'y'.repeat(80), '1', '2', '3', 'z'.repeat(60)],
        ],
      },
    ];
    await expect(svc.render(m)).resolves.toBeInstanceOf(Buffer);
  });
});

/** Yazı tipi arama klasörleri verilen listeye sabitlenmiş servis. */
class DirsPdfService extends DocumentPdfService {
  constructor(private readonly dirs: string[]) {
    super();
  }
  protected override fontDirs(): string[] {
    return this.dirs;
  }
}

describe('DocumentPdfService: dayanıklılık', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'pdf-fonts-'));
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('yazı tipi dosyası yoksa PDF yine üretilir (Helvetica, Türkçe harfler sadeleşir)', async () => {
    const svc = new DirsPdfService([join(tmp, 'yok')]);
    const pdf = await svc.render(model(5));
    const txt = pdf.toString('latin1');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(txt).toContain('/BaseFont /Helvetica');
    expect(txt).not.toContain('LiberationSans');
    expect(pages(pdf)).toBe(1);
  });

  it('bozuk yazı tipi dosyası PDF üretimini düşürmez, yedek yazı tipine geçer', async () => {
    const dir = join(tmp, 'bozuk');
    require('fs').mkdirSync(dir);
    for (const f of ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf']) {
      writeFileSync(join(dir, f), Buffer.alloc(50_000, 7));
    }
    const svc = new DirsPdfService([dir]);
    const pdf = await svc.render(model(5));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('/BaseFont /Helvetica');
  });

  it('ikinci klasörde bulunan yazı tipini kullanır', async () => {
    const real = join(__dirname, '..', 'fonts');
    const svc = new DirsPdfService([join(tmp, 'yok'), real]);
    const pdf = await svc.render(model(2));
    expect(pdf.toString('latin1')).toContain('LiberationSans');
  });

  it('eksik/null alan, denetim karakteri, emoji ve devasa metin çökertmez', async () => {
    const m = model(3);
    m.business = { ...business, name: null as never, phone: undefined as never, address: null as never };
    m.parties = [{ label: 'Cari', lines: ['A\u0000B\u0007C', null as never, '', '😀 Şükrü \uD800 x'] }];
    m.meta = [['Tarih', undefined as never]];
    m.sections[0].rows = [
      ['12.03.2026', 'x'.repeat(100_000), null as never, undefined as never, 12 as never],
      ['\t\r\n', 'çok\nsatırlı\r\nmetin', '', '', ''],
      ['kısa satır'],
    ];
    m.sections[0].foot = [['Toplam', null as never]];
    m.note = 'Not \u0000 ile';
    for (const svc of [new DocumentPdfService(), new DirsPdfService([])]) {
      const pdf = await svc.render(m);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('başlıksız bölüm atlanır, hizalar eksikse varsayılan kullanılır', async () => {
    const m = model(2);
    m.sections = [
      { headers: [], rows: [['x']] },
      { headers: ['A', 'B'], aligns: ['left'], rows: [['1', '2']] },
    ];
    await expect(new DocumentPdfService().render(m)).resolves.toBeInstanceOf(Buffer);
  });

  it('hata iletisi dosya yolunu gizler ve kısa kalır', () => {
    const e = Object.assign(
      new Error("ENOENT: no such file or directory, open '/app/dist/modules/documents/fonts/LiberationSans-Regular.ttf'"),
      { code: 'ENOENT' },
    );
    const msg = describePdfError(e);
    expect(msg).toContain('ENOENT');
    expect(msg).toContain('LiberationSans-Regular.ttf');
    expect(msg).not.toContain('/app/dist');
    expect(describePdfError(new TypeError('x'.repeat(500))).length).toBeLessThan(220);
    expect(describePdfError(undefined)).toContain('Error');
  });
});

describe('Cari ekstre belgesi', () => {
  const entry = (type: 'debit' | 'credit', amount: number, bal: number) => ({
    id: 'e',
    entryType: type,
    amount: String(amount),
    balanceAfter: String(bal),
    sourceType: type === 'debit' ? 'sale' : 'payment',
    description: 'x',
    occurredAt: new Date('2026-03-12T10:00:00Z'),
  });
  const html = new DocumentHtmlService(
    {} as never,
    {} as never,
    {
      findOne: jest.fn(() =>
        Promise.resolve({ name: 'Şükrü Öztürk', phone: '0532', taxNumber: '1' }),
      ),
      getStatement: jest.fn(() =>
        Promise.resolve({
          entries: [entry('debit', 1000, 1000), entry('credit', 400, 600), entry('debit', 50.5, 650.5)],
          openingBalance: 0,
          closingBalance: 650.5,
          lastSettledAt: null,
          from: null,
          to: null,
          scope: 'all',
          hasEarlier: false,
          totalCount: 3,
        }),
      ),
    } as never,
    {} as never,
    {} as never,
    { getBusiness: jest.fn(() => Promise.resolve(business)) } as never,
  );

  it('dönem toplamları ve kapanış bakiyesi son satırlarda', async () => {
    const doc = await html.customerStatementDoc('c1', { scope: 'all' });
    const foot = doc.sections[0].foot!;
    expect(foot.map(([l]) => l)).toEqual([
      'Dönem borç toplamı',
      'Dönem alacak toplamı',
      'Dönem sonu bakiye',
    ]);
    expect(foot[0][1]).toBe('1.050,50 TRY');
    expect(foot[1][1]).toBe('400,00 TRY');
    expect(foot[2][1]).toBe('650,50 TRY');
    expect(doc.sections[0].rows).toHaveLength(3);
  });

  it('HTML ve PDF aynı modelden üretilir', async () => {
    const h = await html.customerStatementHtml('c1', { scope: 'all' });
    expect(h).toContain('CARİ HESAP EKSTRESİ');
    expect(h).toContain('Dönem sonu bakiye');
  });

  it('PDF ucu application/pdf döner, dosya adı ASCII, ?download=1 indirir', async () => {
    const doc = await html.customerStatementDoc('c1', { scope: 'all' });
    const ctrl = new DocumentsController(
      {} as never,
      {} as never,
      { customerStatementDoc: jest.fn(() => Promise.resolve(doc)) } as never,
      new DocumentPdfService(),
    );
    const res = { set: jest.fn() };
    const out = await ctrl.statementPdf('id', {}, undefined, res as never);
    expect(out).toBeDefined();
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="ekstre-sukru-ozturk.pdf"',
      }),
    );
    const res2 = { set: jest.fn() };
    await ctrl.statementPdf('id', {}, '1', res2 as never);
    expect(res2.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'attachment; filename="ekstre-sukru-ozturk.pdf"',
      }),
    );
  });

  it('PDF üretimi çökerse genel mesaj yerine gerçek neden döner', async () => {
    const doc = await html.customerStatementDoc('c1', { scope: 'all' });
    const boom = Object.assign(new Error("ENOENT: open '/x/y/LiberationSans-Bold.ttf'"), { code: 'ENOENT' });
    const ctrl = new DocumentsController(
      {} as never,
      {} as never,
      { customerStatementDoc: jest.fn(() => Promise.resolve(doc)) } as never,
      { render: jest.fn(() => Promise.reject(boom)) } as never,
    );
    const err = await ctrl
      .statementPdf('id', {}, undefined, { set: jest.fn() } as never)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect((err as Error).message).toContain('PDF oluşturulamadı');
    expect((err as Error).message).toContain('LiberationSans-Bold.ttf');
  });

  it('ekstre verisi hazırlanamazsa aşama adıyla bildirilir; 404 olduğu gibi geçer', async () => {
    const ctrlOf = (fn: () => Promise<unknown>) =>
      new DocumentsController(
        {} as never,
        {} as never,
        { customerStatementDoc: jest.fn(fn) } as never,
        new DocumentPdfService(),
      );
    const bad = await ctrlOf(() => Promise.reject(new TypeError("Cannot read properties of null (reading 'x')")))
      .statementPdf('id', {}, undefined, { set: jest.fn() } as never)
      .catch((e: unknown) => e);
    expect((bad as Error).message).toContain('Ekstre hazırlanamadı');
    expect((bad as Error).message).toContain("reading 'x'");
    const nf = await ctrlOf(() => Promise.reject(new NotFoundException('Cari bulunamadı')))
      .statementPdf('id', {}, undefined, { set: jest.fn() } as never)
      .catch((e: unknown) => e);
    expect(nf).toBeInstanceOf(NotFoundException);
  });
});
