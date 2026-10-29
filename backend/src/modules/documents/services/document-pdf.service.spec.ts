import { DocumentPdfService } from './document-pdf.service';
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
});
