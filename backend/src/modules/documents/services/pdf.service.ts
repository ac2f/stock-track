import { existsSync } from 'fs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { BusinessConfig } from '../../../config/configuration';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { QuoteLineKind } from '../../../common/enums/quote-status.enum';
import { SalesService } from '../../sales/sales.service';
import { ProcessingService } from '../../processing/services/processing.service';
import { QuotesService } from '../../quotes/services/quotes.service';
import { CustomersService } from '../../customers/services/customers.service';

// Türkçe karakterler için Unicode TTF aday yolları (gömülü font gerektirir).
const FONT_CANDIDATES: { regular: string; bold: string }[] = [
  {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  },
  {
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  },
];

const moneyFmt = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Injectable()
export class PdfService {
  private readonly business: BusinessConfig;
  private readonly regularFont: string;
  private readonly boldFont: string;

  constructor(
    configService: ConfigService,
    private readonly salesService: SalesService,
    private readonly processingService: ProcessingService,
    private readonly quotesService: QuotesService,
    private readonly customersService: CustomersService,
  ) {
    this.business = configService.get<BusinessConfig>('business')!;
    // Türkçe için sistemde bir TTF bulursak gömeriz; yoksa Helvetica'ya düşeriz.
    const found = FONT_CANDIDATES.find(
      (f) => existsSync(f.regular) && existsSync(f.bold),
    );
    this.regularFont = found?.regular ?? 'Helvetica';
    this.boldFont = found?.bold ?? 'Helvetica-Bold';
  }

  // ── Belge üreticiler ────────────────────────────────────────────────

  async saleInvoice(saleId: string): Promise<Buffer> {
    const sale = await this.salesService.findOne(saleId);
    return this.render((doc) => {
      this.header(doc, 'SATIŞ FATURASI', `#${sale.id.slice(0, 8)}`, sale.saleDate);
      this.partyBlock(doc, 'Müşteri', sale.buyerCustomer);
      const rows = sale.items.map((it) => [
        it.plate?.name ?? it.plateId.slice(0, 8),
        `${this.num(it.quantity)}`,
        `${moneyFmt.format(Number(it.unitPrice))}`,
        `${moneyFmt.format(Number(it.lineTotal))}`,
      ]);
      this.table(doc, ['Kalem', 'Adet', 'Birim Fiyat', 'Tutar'], rows, [
        230, 70, 100, 100,
      ]);
      this.totals(doc, sale.currency, [
        ['Toplam', Number(sale.saleTotal)],
        ...(Number(sale.ownerAmount) > 0
          ? ([['Malzeme sahibi payı', Number(sale.ownerAmount)]] as [
              string,
              number,
            ][])
          : []),
        ['İşletme kârı', Number(sale.businessMargin)],
      ]);
      this.footer(doc, sale.note);
    });
  }

  async processingReceipt(jobId: string): Promise<Buffer> {
    const job = await this.processingService.findOne(jobId);
    const customer = job.customerId
      ? await this.customersService.findOne(job.customerId)
      : null;
    return this.render((doc) => {
      this.header(
        doc,
        'İŞLEME FİŞİ',
        `#${job.id.slice(0, 8)}`,
        job.processedAt,
      );
      if (customer) this.partyBlock(doc, 'Müşteri', customer);
      const unit = this.unitLabel(job.billingUnit);
      this.table(
        doc,
        ['Malzeme', 'Ölçü', 'Birim Fiyat', 'İşçilik'],
        [
          [
            job.plate?.name ?? job.plateId.slice(0, 8),
            `${this.num(job.quantityValue)} ${unit}`,
            `${moneyFmt.format(Number(job.ratePerUnit))}/${unit}`,
            `${moneyFmt.format(Number(job.laborCost))}`,
          ],
        ],
        [180, 110, 110, 100],
      );
      this.totals(doc, job.currency, [
        ['İşçilik', Number(job.laborCost)],
        ...(Number(job.extraCost) > 0
          ? ([['Ek maliyet', Number(job.extraCost)]] as [string, number][])
          : []),
        ['Genel toplam', Number(job.totalCost)],
      ]);
      this.footer(doc, job.note);
    });
  }

  async quote(quoteId: string): Promise<Buffer> {
    const q = await this.quotesService.findOne(quoteId);
    return this.render((doc) => {
      this.header(doc, 'TEKLİF (PROFORMA)', q.quoteNo, q.createdAt);
      this.partyBlock(doc, 'Sayın', q.buyerCustomer);
      if (q.validUntil) {
        this.font(doc).fontSize(9).fillColor('#555');
        doc.text(
          `Geçerlilik: ${new Date(q.validUntil).toLocaleDateString('tr-TR')}`,
        );
        doc.moveDown(0.5);
      }
      const rows = q.items.map((it) => [
        `${it.lineKind === QuoteLineKind.PROCESSING ? '[İşleme] ' : ''}${
          it.plate?.name ?? it.description ?? it.plateId.slice(0, 8)
        }`,
        `${this.num(it.quantity)}`,
        `${moneyFmt.format(Number(it.unitPrice))}`,
        `${moneyFmt.format(Number(it.lineTotal))}`,
      ]);
      this.table(doc, ['Kalem', 'Adet', 'Birim', 'Tutar'], rows, [
        230, 70, 100, 100,
      ]);
      this.totals(doc, q.currency, [['Genel toplam', Number(q.total)]]);
      this.footer(doc, q.note);
    });
  }

  async customerStatement(customerId: string): Promise<Buffer> {
    const customer = await this.customersService.findOne(customerId);
    const ledger = await this.customersService.getLedger(customerId);
    return this.render((doc) => {
      this.header(doc, 'CARİ HESAP EKSTRESİ', customer.name, new Date());
      this.partyBlock(doc, 'Cari', customer);
      const rows = [...ledger]
        .reverse()
        .map((e) => [
          new Date(e.occurredAt).toLocaleDateString('tr-TR'),
          e.description ?? e.sourceType,
          e.entryType === 'debit' ? moneyFmt.format(Number(e.amount)) : '',
          e.entryType === 'credit' ? moneyFmt.format(Number(e.amount)) : '',
          moneyFmt.format(Number(e.balanceAfter)),
        ]);
      this.table(
        doc,
        ['Tarih', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'],
        rows,
        [70, 180, 80, 80, 90],
      );
      this.totals(doc, this.business.defaultCurrency, [
        ['Güncel bakiye', Number(customer.currentBalance)],
      ]);
    });
  }

  // ── Ortak çizim yardımcıları ────────────────────────────────────────

  private render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        build(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private font(doc: PDFKit.PDFDocument, bold = false): PDFKit.PDFDocument {
    return doc.font(bold ? this.boldFont : this.regularFont);
  }

  private header(
    doc: PDFKit.PDFDocument,
    title: string,
    ref: string,
    date: Date,
  ): void {
    this.font(doc, true).fontSize(16).fillColor('#111');
    doc.text(this.business.name || 'StockTrack', { continued: false });
    this.font(doc).fontSize(9).fillColor('#555');
    const lines = [
      this.business.address,
      this.business.phone ? `Tel: ${this.business.phone}` : '',
      this.business.taxNo ? `VKN: ${this.business.taxNo}` : '',
    ].filter(Boolean);
    if (lines.length) doc.text(lines.join('  ·  '));

    doc.moveDown(0.8);
    this.font(doc, true).fontSize(14).fillColor('#111');
    doc.text(title);
    this.font(doc).fontSize(9).fillColor('#555');
    doc.text(`Belge No: ${ref}`);
    doc.text(`Tarih: ${new Date(date).toLocaleDateString('tr-TR')}`);
    doc.moveDown(0.8);
    doc
      .strokeColor('#ddd')
      .moveTo(40, doc.y)
      .lineTo(555, doc.y)
      .stroke();
    doc.moveDown(0.6);
  }

  private partyBlock(
    doc: PDFKit.PDFDocument,
    label: string,
    party: {
      name: string;
      companyName?: string;
      phone?: string;
      taxNumber?: string;
    },
  ): void {
    this.font(doc, true).fontSize(10).fillColor('#111');
    doc.text(`${label}: ${party.name}`);
    this.font(doc).fontSize(9).fillColor('#555');
    const extra = [
      party.companyName,
      party.phone ? `Tel: ${party.phone}` : '',
      party.taxNumber ? `VKN: ${party.taxNumber}` : '',
    ].filter(Boolean);
    if (extra.length) doc.text(extra.join('  ·  '));
    doc.moveDown(0.6);
  }

  private table(
    doc: PDFKit.PDFDocument,
    headers: string[],
    rows: string[][],
    widths: number[],
  ): void {
    const startX = 40;
    const rightAlignFrom = 1; // ilk sütun sola, kalanlar sağa yaslı
    const drawRow = (cells: string[], bold: boolean) => {
      const y = doc.y;
      let x = startX;
      this.font(doc, bold).fontSize(9).fillColor(bold ? '#111' : '#222');
      cells.forEach((cell, i) => {
        doc.text(cell, x + 2, y, {
          width: widths[i] - 4,
          align: i >= rightAlignFrom ? 'right' : 'left',
        });
        x += widths[i];
      });
      doc.y = y + 16;
    };
    drawRow(headers, true);
    doc
      .strokeColor('#ddd')
      .moveTo(startX, doc.y - 2)
      .lineTo(startX + widths.reduce((a, b) => a + b, 0), doc.y - 2)
      .stroke();
    rows.forEach((r) => drawRow(r, false));
    doc.moveDown(0.5);
  }

  private totals(
    doc: PDFKit.PDFDocument,
    currency: string,
    lines: [string, number][],
  ): void {
    doc.moveDown(0.3);
    const labelX = 320;
    const valX = 440;
    lines.forEach(([label, value], idx) => {
      const last = idx === lines.length - 1;
      const y = doc.y;
      this.font(doc, last).fontSize(last ? 11 : 9).fillColor('#111');
      doc.text(label, labelX, y, { width: 110, align: 'right' });
      doc.text(`${moneyFmt.format(value)} ${currency}`, valX, y, {
        width: 115,
        align: 'right',
      });
      doc.y = y + (last ? 18 : 14);
    });
  }

  private footer(doc: PDFKit.PDFDocument, note?: string | null): void {
    if (note) {
      doc.moveDown(1);
      this.font(doc).fontSize(9).fillColor('#555');
      doc.text(`Not: ${note}`);
    }
  }

  private num(value: number | string): string {
    const n = Number(value);
    return Number.isInteger(n) ? String(n) : moneyFmt.format(n);
  }

  private unitLabel(unit: MeasurementType): string {
    switch (unit) {
      case MeasurementType.AREA:
        return 'm²';
      case MeasurementType.LENGTH:
        return 'm';
      case MeasurementType.WEIGHT:
        return 'kg';
      default:
        return 'adet';
    }
  }
}
