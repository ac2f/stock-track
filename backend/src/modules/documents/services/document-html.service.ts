import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessConfig } from '../../../config/configuration';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { SalesService } from '../../sales/sales.service';
import { ProcessingService } from '../../processing/services/processing.service';
import { CustomersService } from '../../customers/services/customers.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { FinancialReportsService } from '../../reports/services/financial-reports.service';
import { QueryExpenseDto } from '../../expenses/dto/expense.dto';

const LEDGER_SOURCE_LABELS: Record<string, string> = {
  [LedgerSourceType.OPENING]: 'Açılış',
  [LedgerSourceType.PROCESSING]: 'İşleme',
  [LedgerSourceType.SALE]: 'Satış',
  [LedgerSourceType.PAYMENT]: 'Ödeme',
  [LedgerSourceType.MANUAL_ADJUSTMENT]: 'Manuel',
};

const UNIT_LABELS: Record<string, string> = {
  [MeasurementType.AREA]: 'm²',
  [MeasurementType.LENGTH]: 'metre',
  [MeasurementType.PIECE]: 'adet',
  [MeasurementType.WEIGHT]: 'kg',
};

interface Party {
  label: string;
  lines: string[];
}

interface Section {
  /** Bölüm başlığı (opsiyonel). */
  title?: string;
  headers: string[];
  /** Sütun hizaları; verilmezse ilk sütun sola, kalanlar sağa yaslanır. */
  aligns?: ('left' | 'right')[];
  rows: (string | number)[][];
  /** Tablo altı toplam satırları (etiket → değer). */
  foot?: [string, string][];
}

/**
 * Tüm belgeleri (satış faturası, işleme fişi, cari ekstre, gider/mali rapor)
 * TEK TİP, düzenlenebilir HTML olarak üretir. Tarayıcıda açılır; sağ üstteki
 * "Yazdır / PDF" düğmesi (Ctrl+P) ile PDF olarak kaydedilir. UTF-8 olduğundan
 * Türkçe karakter/yazı tipi sorunu yaşanmaz (pdfkit'in yerini alır).
 */
@Injectable()
export class DocumentHtmlService {
  private readonly business: BusinessConfig;
  private readonly money: Intl.NumberFormat;

  constructor(
    private readonly salesService: SalesService,
    private readonly processingService: ProcessingService,
    private readonly customersService: CustomersService,
    private readonly expensesService: ExpensesService,
    private readonly financialReports: FinancialReportsService,
    configService: ConfigService,
  ) {
    this.business = configService.get<BusinessConfig>('business')!;
    this.money = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ── Satış faturası ──────────────────────────────────────────────────
  async saleHtml(saleId: string): Promise<string> {
    const sale = await this.salesService.findOne(saleId);
    const rows = (sale.items ?? []).map((it) => [
      it.plate?.name ?? it.plateId.slice(0, 8),
      this.num(it.quantity),
      `${this.money.format(Number(it.unitPrice))}`,
      `${this.money.format(Number(it.lineTotal))}`,
    ]);
    const foot: [string, string][] = [
      ['Toplam', this.cur(Number(sale.saleTotal), sale.currency)],
    ];
    if (Number(sale.ownerAmount) > 0) {
      foot.push([
        'Malzeme sahibi payı',
        this.cur(Number(sale.ownerAmount), sale.currency),
      ]);
    }
    foot.push([
      'İşletme kârı',
      this.cur(Number(sale.businessMargin), sale.currency),
    ]);

    return this.layout({
      docTitle: 'SATIŞ FATURASI',
      pageTitle: `Satış ${sale.id.slice(0, 8)}`,
      meta: [
        ['Belge No', `#${sale.id.slice(0, 8)}`],
        ['Tarih', this.date(sale.saleDate)],
      ],
      parties: [this.partyOf('Müşteri', sale.buyerCustomer)],
      sections: [
        {
          headers: ['Kalem', 'Adet', 'Birim Fiyat', 'Tutar'],
          rows,
          foot,
        },
      ],
      note: sale.note,
    });
  }

  // ── İşleme fişi ─────────────────────────────────────────────────────
  async processingHtml(jobId: string): Promise<string> {
    const job = await this.processingService.findOne(jobId);
    const customer = job.customerId
      ? await this.customersService.findOne(job.customerId)
      : null;
    const unit = UNIT_LABELS[job.billingUnit] ?? 'adet';
    const foot: [string, string][] = [
      ['İşçilik', this.cur(Number(job.laborCost), job.currency)],
    ];
    if (Number(job.extraCost) > 0) {
      foot.push(['Ek maliyet', this.cur(Number(job.extraCost), job.currency)]);
    }
    foot.push(['Genel toplam', this.cur(Number(job.totalCost), job.currency)]);

    return this.layout({
      docTitle: 'İŞLEME FİŞİ',
      pageTitle: `İşleme ${job.id.slice(0, 8)}`,
      meta: [
        ['Belge No', `#${job.id.slice(0, 8)}`],
        ['Tarih', this.date(job.processedAt)],
      ],
      parties: customer ? [this.partyOf('Müşteri', customer)] : [],
      sections: [
        {
          headers: ['Malzeme', 'Ölçü', 'Birim Fiyat', 'İşçilik'],
          rows: [
            [
              job.plate?.name ?? job.plateId.slice(0, 8),
              `${this.num(job.quantityValue)} ${unit}`,
              `${this.money.format(Number(job.ratePerUnit))}/${unit}`,
              `${this.money.format(Number(job.laborCost))}`,
            ],
          ],
          foot,
        },
      ],
      note: job.note,
    });
  }

  // ── Cari hesap ekstresi ─────────────────────────────────────────────
  async customerStatementHtml(customerId: string): Promise<string> {
    const customer = await this.customersService.findOne(customerId);
    const ledger = await this.customersService.getLedger(customerId);
    const rows = [...ledger].reverse().map((e) => {
      const label = LEDGER_SOURCE_LABELS[e.sourceType] ?? e.sourceType;
      const desc = e.description ? `${label} · ${e.description}` : label;
      return [
        this.date(e.occurredAt),
        desc,
        e.entryType === 'debit' ? this.money.format(Number(e.amount)) : '',
        e.entryType === 'credit' ? this.money.format(Number(e.amount)) : '',
        this.money.format(Number(e.balanceAfter)),
      ];
    });

    return this.layout({
      docTitle: 'CARİ HESAP EKSTRESİ',
      pageTitle: `Ekstre ${customer.name}`,
      meta: [['Tarih', this.date(new Date())]],
      parties: [this.partyOf('Cari', customer)],
      sections: [
        {
          headers: ['Tarih', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'],
          aligns: ['left', 'left', 'right', 'right', 'right'],
          rows,
          foot: [
            [
              'Güncel bakiye',
              this.cur(
                Number(customer.currentBalance),
                this.business.defaultCurrency,
              ),
            ],
          ],
        },
      ],
    });
  }

  // ── Gider raporu ────────────────────────────────────────────────────
  async expensesReportHtml(query: QueryExpenseDto): Promise<string> {
    const list = await this.expensesService.findExpenses({
      ...query,
      page: 1,
      limit: 1000,
    } as QueryExpenseDto);
    const summary = await this.expensesService.summary(query);

    const rows = list.items.map((e) => [
      e.expenseDate,
      e.category?.name ?? '—',
      e.project?.name ?? '—',
      e.description ?? '',
      this.money.format(Number(e.amount)),
    ]);

    const sections: Section[] = [
      {
        headers: ['Tarih', 'Tür', 'İş / Proje', 'Açıklama', 'Tutar'],
        aligns: ['left', 'left', 'left', 'left', 'right'],
        rows,
        foot: [
          ['Toplam', this.cur(summary.total, this.business.defaultCurrency)],
        ],
      },
    ];
    if (summary.byCategory.length) {
      sections.push({
        title: 'Türe göre dağılım',
        headers: ['Gider türü', 'Tutar'],
        aligns: ['left', 'right'],
        rows: summary.byCategory.map((c) => [
          c.name ?? '—',
          this.money.format(Number(c.total)),
        ]),
      });
    }

    return this.layout({
      docTitle: 'GİDER RAPORU',
      pageTitle: 'Gider Raporu',
      meta: [['Dönem', this.period(query.from, query.to)]],
      parties: [],
      sections,
    });
  }

  // ── Mali rapor (kâr/zarar + yaşlandırma) ────────────────────────────
  async financialReportHtml(from?: string, to?: string): Promise<string> {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const pl = await this.financialReports.profitLoss(fromDate, toDate);
    const aging = await this.financialReports.aging(undefined, toDate);
    const cur = this.business.defaultCurrency;

    const plRows: [string, number][] = [
      ['İşleme geliri', pl.processingRevenue],
      ['Satış cirosu', pl.salesTurnover],
      ['Satış kârı', pl.salesMargin],
      ['Alış maliyeti', pl.purchaseCost],
      ['Gelir (işleme + satış kârı)', pl.income],
      ['Gider (alış)', pl.expense],
    ];

    const sections: Section[] = [
      {
        title: 'Kâr / Zarar',
        headers: ['Kalem', 'Tutar'],
        aligns: ['left', 'right'],
        rows: plRows.map(([label, value]) => [
          label,
          this.money.format(value),
        ]),
        foot: [['Net', this.cur(pl.net, cur)]],
      },
    ];
    if (aging.length) {
      sections.push({
        title: 'Alacak yaşlandırma',
        headers: ['Müşteri', '0-30', '31-60', '61-90', '90+', 'Toplam'],
        aligns: ['left', 'right', 'right', 'right', 'right', 'right'],
        rows: aging.map((a) => [
          a.customerName,
          this.money.format(a.current),
          this.money.format(a.days31to60),
          this.money.format(a.days61to90),
          this.money.format(a.over90),
          this.money.format(a.total),
        ]),
        foot: [
          [
            'Toplam alacak',
            this.cur(
              aging.reduce((s, a) => s + a.total, 0),
              cur,
            ),
          ],
        ],
      });
    }

    return this.layout({
      docTitle: 'MALİ RAPOR',
      pageTitle: 'Mali Rapor',
      meta: [['Dönem', this.period(from, to)]],
      parties: [],
      sections,
    });
  }

  // ── Ortak HTML düzeni ───────────────────────────────────────────────
  private layout(opts: {
    docTitle: string;
    pageTitle: string;
    meta: [string, string][];
    parties: Party[];
    sections: Section[];
    note?: string | null;
  }): string {
    const metaHtml = opts.meta
      .map(([k, v]) => `<div class="muted">${esc(k)}: ${esc(v)}</div>`)
      .join('\n');

    const partiesHtml = opts.parties.length
      ? `<div class="parties">${opts.parties
          .map(
            (p) =>
              `<div><div class="label">${esc(p.label)}</div>${p.lines
                .map((l, i) =>
                  i === 0
                    ? `<div style="font-weight:600;">${esc(l)}</div>`
                    : `<div class="muted">${esc(l)}</div>`,
                )
                .join('')}</div>`,
          )
          .join('')}</div>`
      : '';

    const sectionsHtml = opts.sections
      .map((s) => this.section(s))
      .join('\n');

    const noteHtml = opts.note
      ? `<div class="note">${esc(opts.note)}</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(opts.pageTitle)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px; font-size: 13px; }
      .sheet { max-width: 800px; margin: 0 auto; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .muted { color: #64748b; }
      .meta { text-align: right; font-size: 12px; }
      .parties { display: flex; gap: 24px; margin: 24px 0; }
      .parties > div { flex: 1; }
      .label { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: .04em; }
      h2.section { font-size: 13px; text-transform: uppercase; color: #475569; margin: 22px 0 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #e2e8f0; }
      th { font-size: 11px; text-transform: uppercase; color: #64748b; }
      td.num, th.num { text-align: right; }
      tfoot td { border: 0; padding-top: 6px; }
      .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #1e293b; }
      .note { margin-top: 18px; color: #475569; white-space: pre-wrap; }
      .print-btn { position: fixed; top: 16px; right: 16px; background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
      @media print { .print-btn { display: none; } body { padding: 0; } }
    </style>
  </head>
  <body>
    <button class="print-btn" onclick="window.print()">Yazdır / PDF</button>
    <div class="sheet">
      <div class="head">
        <div>
          <h1>${esc(this.business.name || 'StockTrack')}</h1>
          <div class="muted">${esc(this.business.phone || '')}</div>
          <div class="muted">${esc(this.business.address || '')}</div>
        </div>
        <div class="meta">
          <div style="font-size:16px;font-weight:700;">${esc(opts.docTitle)}</div>
          ${metaHtml}
        </div>
      </div>
      ${partiesHtml}
      ${sectionsHtml}
      ${noteHtml}
    </div>
  </body>
</html>`;
  }

  private section(s: Section): string {
    const aligns =
      s.aligns ?? s.headers.map((_, i) => (i === 0 ? 'left' : 'right'));
    const title = s.title
      ? `<h2 class="section">${esc(s.title)}</h2>`
      : '';
    const head = s.headers
      .map((h, i) => `<th class="${aligns[i] === 'right' ? 'num' : ''}">${esc(h)}</th>`)
      .join('');
    const body = s.rows.length
      ? s.rows
          .map(
            (r) =>
              `<tr>${r
                .map(
                  (c, i) =>
                    `<td class="${aligns[i] === 'right' ? 'num' : ''}">${esc(String(c))}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('')
      : `<tr><td colspan="${s.headers.length}" class="muted" style="text-align:center;padding:14px;">Kayıt yok.</td></tr>`;

    let foot = '';
    if (s.foot?.length) {
      const span = s.headers.length - 1;
      foot =
        '<tfoot>' +
        s.foot
          .map(
            ([label, value], idx) =>
              `<tr class="${idx === s.foot!.length - 1 ? 'total-row' : ''}">` +
              `<td colspan="${span}" class="num muted">${esc(label)}</td>` +
              `<td class="num">${esc(value)}</td></tr>`,
          )
          .join('') +
        '</tfoot>';
    }

    return `${title}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
  }

  private partyOf(
    label: string,
    party: {
      name: string;
      companyName?: string | null;
      phone?: string | null;
      taxNumber?: string | null;
    },
  ): Party {
    const lines = [party.name];
    if (party.companyName) lines.push(party.companyName);
    if (party.phone) lines.push(`Tel: ${party.phone}`);
    if (party.taxNumber) lines.push(`VKN: ${party.taxNumber}`);
    return { label, lines };
  }

  private cur(value: number, currency: string): string {
    return `${this.money.format(value)} ${currency}`;
  }

  private date(d: Date | string): string {
    return new Date(d).toLocaleDateString('tr-TR');
  }

  private period(from?: string, to?: string): string {
    if (!from && !to) return 'Tüm zamanlar';
    return `${from ? this.date(from) : '…'} – ${to ? this.date(to) : '…'}`;
  }

  private num(value: number | string): string {
    const n = Number(value);
    return Number.isInteger(n) ? String(n) : this.money.format(n);
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
