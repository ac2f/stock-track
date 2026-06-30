import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { FinancialReportsService } from '../../reports/services/financial-reports.service';
import { InventoryReportsService } from '../../reports/services/inventory-reports.service';
import { CustomersService } from '../../customers/services/customers.service';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';

/** Cari hareket kaynağının Türkçe etiketleri (ekstre çıktılarında). */
const LEDGER_SOURCE_LABELS: Record<string, string> = {
  [LedgerSourceType.OPENING]: 'Açılış',
  [LedgerSourceType.PROCESSING]: 'İşleme',
  [LedgerSourceType.SALE]: 'Satış',
  [LedgerSourceType.PAYMENT]: 'Ödeme',
  [LedgerSourceType.DISCOUNT]: 'İndirim',
  [LedgerSourceType.MANUAL_ADJUSTMENT]: 'Manuel',
};

/** CSV hücresini kaçışlar (noktalı virgül/çift tırnak/satır sonu içerirse). */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Rapor ve cari dökümlerini gerçek .xlsx çalışma kitabına aktarır.
 * Rapor servisleri düz nesne döndürdüğü için ek serileştirme gerekmez.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly financialReports: FinancialReportsService,
    private readonly inventoryReports: InventoryReportsService,
    private readonly customersService: CustomersService,
  ) {}

  async agingXlsx(customerId?: string, asOf?: Date): Promise<Buffer> {
    const rows = await this.financialReports.aging(customerId, asOf);
    const wb = new Workbook();
    const ws = wb.addWorksheet('Yaşlandırma');
    ws.columns = [
      { header: 'Müşteri', key: 'customerName', width: 30 },
      { header: '0-30', key: 'current', width: 14, style: this.money },
      { header: '31-60', key: 'days31to60', width: 14, style: this.money },
      { header: '61-90', key: 'days61to90', width: 14, style: this.money },
      { header: '90+', key: 'over90', width: 14, style: this.money },
      { header: 'Toplam', key: 'total', width: 16, style: this.money },
    ];
    rows.forEach((r) => ws.addRow(r));
    this.styleHeader(ws);
    return this.toBuffer(wb);
  }

  async profitLossXlsx(from?: Date, to?: Date): Promise<Buffer> {
    const pl = await this.financialReports.profitLoss(from, to);
    const wb = new Workbook();
    const ws = wb.addWorksheet('Kar-Zarar');
    ws.columns = [
      { header: 'Kalem', key: 'label', width: 32 },
      { header: 'Tutar', key: 'value', width: 18, style: this.money },
    ];
    const rows: [string, number][] = [
      ['İşleme geliri', pl.processingRevenue],
      ['Satış cirosu', pl.salesTurnover],
      ['Satış kârı', pl.salesMargin],
      ['Alış maliyeti', pl.purchaseCost],
      ['Gelir (işleme + satış kârı)', pl.income],
      ['Gider (alış)', pl.expense],
      ['Net', pl.net],
    ];
    rows.forEach(([label, value]) => ws.addRow({ label, value }));
    this.styleHeader(ws);
    return this.toBuffer(wb);
  }

  async stockValueXlsx(warehouseId?: string): Promise<Buffer> {
    const report = await this.inventoryReports.stockValue(warehouseId);
    const wb = new Workbook();
    const ws = wb.addWorksheet('Stok Değeri');
    ws.columns = [
      { header: 'Depo', key: 'warehouseName', width: 28 },
      { header: 'Miktar', key: 'quantity', width: 16 },
      { header: 'Değer', key: 'value', width: 18, style: this.money },
    ];
    report.byWarehouse.forEach((w) => ws.addRow(w));
    ws.addRow({ warehouseName: 'TOPLAM', value: report.totalValue });
    this.styleHeader(ws);

    if (report.consignmentByOwner.length) {
      const cs = wb.addWorksheet('Konsinye (Sahip)');
      cs.columns = [
        { header: 'Sahip', key: 'ownerName', width: 28 },
        { header: 'Miktar', key: 'quantity', width: 16 },
        { header: 'Kalem', key: 'itemCount', width: 12 },
      ];
      report.consignmentByOwner.forEach((o) => cs.addRow(o));
      this.styleHeader(cs);
    }
    return this.toBuffer(wb);
  }

  async customerLedgerXlsx(customerId: string): Promise<Buffer> {
    const customer = await this.customersService.findOne(customerId);
    const ledger = await this.customersService.getLedger(customerId);
    const wb = new Workbook();
    const ws = wb.addWorksheet('Cari Ekstre');
    ws.columns = [
      { header: 'Tarih', key: 'date', width: 14 },
      { header: 'Açıklama', key: 'description', width: 36 },
      { header: 'Borç', key: 'debit', width: 14, style: this.money },
      { header: 'Alacak', key: 'credit', width: 14, style: this.money },
      { header: 'Bakiye', key: 'balance', width: 16, style: this.money },
    ];
    [...ledger].reverse().forEach((e) =>
      ws.addRow({
        date: new Date(e.occurredAt).toLocaleDateString('tr-TR'),
        description: e.description ?? e.sourceType,
        debit: e.entryType === 'debit' ? Number(e.amount) : null,
        credit: e.entryType === 'credit' ? Number(e.amount) : null,
        balance: Number(e.balanceAfter),
      }),
    );
    ws.addRow({
      description: `${customer.name} — Güncel bakiye`,
      balance: Number(customer.currentBalance),
    });
    this.styleHeader(ws);
    return this.toBuffer(wb);
  }

  /**
   * Cari ekstreyi CSV (Excel'de açılabilir, noktalı virgülle ayrılmış) üretir.
   * UTF-8 BOM eklenir ki Excel Türkçe karakterleri doğru göstersin.
   */
  async customerLedgerCsv(customerId: string): Promise<string> {
    const customer = await this.customersService.findOne(customerId);
    const ledger = await this.customersService.getLedger(customerId);
    const header = ['Tarih', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'];
    const rows: (string | number)[][] = [...ledger].reverse().map((e) => {
      const label = LEDGER_SOURCE_LABELS[e.sourceType] ?? e.sourceType;
      const desc = e.description ? `${label} · ${e.description}` : label;
      return [
        new Date(e.occurredAt).toLocaleDateString('tr-TR'),
        desc,
        e.entryType === 'debit' ? Number(e.amount) : '',
        e.entryType === 'credit' ? Number(e.amount) : '',
        Number(e.balanceAfter),
      ];
    });
    rows.push(['', `${customer.name} — Güncel bakiye`, '', '', Number(customer.currentBalance)]);
    return (
      '﻿' +
      [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
    );
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────

  private readonly money = { numFmt: '#,##0.00' };

  private styleHeader(ws: import('exceljs').Worksheet): void {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEFEFEF' },
      };
    });
  }

  private async toBuffer(wb: Workbook): Promise<Buffer> {
    const data = await wb.xlsx.writeBuffer();
    return Buffer.from(data);
  }
}
