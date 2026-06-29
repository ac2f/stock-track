import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { SettingsService } from '../../settings/settings.service';
import { QuoteLineKind, QuoteStatus } from '../../../common/enums/quote-status.enum';
import { computeQuantityValue } from '../../processing/processing-calc.util';
import { QuotesService } from '../../quotes/services/quotes.service';
import { QuoteItem } from '../../quotes/entities/quote-item.entity';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: 'Taslak',
  [QuoteStatus.SENT]: 'Gönderildi',
  [QuoteStatus.ACCEPTED]: 'Kabul',
  [QuoteStatus.REJECTED]: 'Red',
  [QuoteStatus.EXPIRED]: 'Süresi doldu',
  [QuoteStatus.CONVERTED]: 'Dönüştürüldü',
};

const UNIT_LABELS: Record<MeasurementType, string> = {
  [MeasurementType.AREA]: 'm²',
  [MeasurementType.LENGTH]: 'metre',
  [MeasurementType.PIECE]: 'adet',
  [MeasurementType.WEIGHT]: 'kg',
};

/**
 * Teklifi DÜZENLENEBİLİR HTML şablonundan (templates/quote.html) üretir ve CSV
 * tablo çıktısı verir. HTML, UTF-8 olduğundan Türkçe karakter sorunu yaşanmaz;
 * tarayıcıda görüntülenip Ctrl+P ile PDF olarak kaydedilebilir.
 */
@Injectable()
export class QuoteDocumentService {
  private readonly money: Intl.NumberFormat;

  constructor(
    private readonly quotesService: QuotesService,
    private readonly settings: SettingsService,
  ) {
    this.money = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** Teklifin düzenlenebilir şablondan üretilmiş yazdırılabilir HTML'i. */
  async quoteHtml(quoteId: string): Promise<string> {
    const business = await this.settings.getBusiness();
    const q = await this.quotesService.findOne(quoteId);
    const tpl = this.loadTemplate();
    const c = q.buyerCustomer;

    const rows = (q.items ?? [])
      .map((it, i) => this.row(it, i + 1))
      .join('\n');

    const map: Record<string, string> = {
      businessName: esc(business.name || 'StockTrack'),
      businessPhone: esc(business.phone || ''),
      businessAddress: esc(business.address || ''),
      quoteNo: esc(q.quoteNo),
      date: this.date(q.createdAt),
      validUntil: q.validUntil ? this.date(q.validUntil) : '—',
      statusLabel: STATUS_LABELS[q.status] ?? q.status,
      customerName: esc(c?.name ?? '—'),
      customerCompany: esc(c?.companyName ?? ''),
      customerPhone: esc(c?.phone ?? ''),
      rows,
      subtotal: this.money.format(Number(q.subtotal)),
      total: this.money.format(Number(q.total)),
      currency: esc(q.currency),
      note: esc(q.note ?? ''),
    };
    return tpl.replace(/{{(\w+)}}/g, (_, key: string) => map[key] ?? '');
  }

  /** Teklif kalemlerinin CSV (Excel'de açılabilir) tablo çıktısı. */
  async quoteCsv(quoteId: string): Promise<string> {
    const q = await this.quotesService.findOne(quoteId);
    const header = [
      'Sira',
      'Cins',
      'Malzeme',
      'Birim',
      'Miktar',
      'BirimFiyat',
      'Tutar',
      'ParaBirimi',
    ];
    const lines = (q.items ?? []).map((it, i) => {
      const m = this.measure(it);
      return [
        i + 1,
        it.lineKind === QuoteLineKind.SALE ? 'Satis' : 'Isleme',
        it.plate?.name ?? '',
        UNIT_LABELS[m.unit],
        m.value,
        Number(it.unitPrice),
        Number(it.lineTotal),
        q.currency,
      ];
    });
    lines.push(['', '', '', '', '', '', Number(q.total), q.currency]);
    // UTF-8 BOM → Excel Türkçe karakterleri doğru gösterir.
    return (
      '﻿' +
      [header, ...lines].map((r) => r.map(csvCell).join(';')).join('\r\n')
    );
  }

  private row(it: QuoteItem, index: number): string {
    const kind = it.lineKind === QuoteLineKind.SALE ? 'Satış' : 'İşleme';
    const m = this.measure(it);
    const desc = it.description ? ` — ${esc(it.description)}` : '';
    return [
      '<tr>',
      `<td>${index}</td>`,
      `<td><strong>${esc(it.plate?.name ?? '—')}</strong> <span class="muted">(${kind})</span>${desc}</td>`,
      `<td>${UNIT_LABELS[m.unit]}</td>`,
      `<td class="num">${this.money.format(m.value)}</td>`,
      `<td class="num">${this.money.format(Number(it.unitPrice))}</td>`,
      `<td class="num">${this.money.format(Number(it.lineTotal))}</td>`,
      '</tr>',
    ].join('');
  }

  /** Kalemin ölçü birimi + miktarı (m²/metre/adet). */
  private measure(it: QuoteItem): { unit: MeasurementType; value: number } {
    const unit = it.billingUnit ?? MeasurementType.PIECE;
    try {
      const value = computeQuantityValue({
        billingUnit: unit,
        quantity: Number(it.quantity),
        widthMm: it.widthMm != null ? Number(it.widthMm) : null,
        heightMm: it.heightMm != null ? Number(it.heightMm) : null,
        lengthMeters: it.lengthMeters != null ? Number(it.lengthMeters) : null,
      });
      return { unit, value };
    } catch {
      // Ölçü hesaplanamazsa adet bazına düş.
      return { unit: MeasurementType.PIECE, value: Number(it.quantity) };
    }
  }

  private loadTemplate(): string {
    // dev (src) ve prod (dist) için aynı göreli yol — html asset olarak kopyalanır.
    return readFileSync(join(__dirname, '..', 'templates', 'quote.html'), 'utf-8');
  }

  private date(d: Date): string {
    return new Date(d).toLocaleDateString('tr-TR');
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
