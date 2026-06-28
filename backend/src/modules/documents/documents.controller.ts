import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { QueryExpenseDto } from '../expenses/dto/expense.dto';
import { ExportService } from './services/export.service';
import { QuoteDocumentService } from './services/quote-document.service';
import { DocumentHtmlService } from './services/document-html.service';

const HTML = 'text/html; charset=utf-8';
const CSV = 'text/csv; charset=utf-8';
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Belge üretimi. Yazdırılabilir belgeler (fatura/fiş/ekstre/rapor) TEK TİP,
 * düzenlenebilir HTML olarak döner; tarayıcıda açılıp Ctrl+P ile PDF alınır.
 * Veri dökümleri ayrıca CSV/Excel olarak indirilebilir.
 */
@ApiTags('documents')
@ApiBearerAuth()
@Controller({ version: '1' })
export class DocumentsController {
  constructor(
    private readonly exports: ExportService,
    private readonly quoteDocs: QuoteDocumentService,
    private readonly html: DocumentHtmlService,
  ) {}

  // ── Yazdırılabilir HTML belgeler (OWNER + EMPLOYEE) ─────────────────

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('sales/:id/print')
  async saleInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': HTML });
    return this.html.saleHtml(id);
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('processing/:id/print')
  async processingReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': HTML });
    return this.html.processingHtml(id);
  }

  // Düzenlenebilir HTML şablondan yazdırılabilir teklif (Ctrl+P ile PDF).
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('quotes/:id/print')
  async quotePrint(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': HTML });
    return this.quoteDocs.quoteHtml(id);
  }

  // Teklif kalemlerinin CSV (tablo) çıktısı — Excel'de açılır.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('quotes/:id/csv')
  async quoteCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.quoteDocs.quoteCsv(id);
    return this.stream(
      res,
      Buffer.from(csv, 'utf-8'),
      CSV,
      `teklif-${id.slice(0, 8)}.csv`,
    );
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('customers/:id/statement')
  async statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': HTML });
    return this.html.customerStatementHtml(id);
  }

  // Cari ekstrenin CSV (tablo) çıktısı — Excel'de açılır.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('customers/:id/statement.csv')
  async statementCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.exports.customerLedgerCsv(id);
    return this.stream(
      res,
      Buffer.from(csv, 'utf-8'),
      CSV,
      `ekstre-${id.slice(0, 8)}.csv`,
    );
  }

  // Gider raporu (yazdırılabilir HTML) — yalnızca OWNER.
  @Roles(UserRole.OWNER)
  @Get('expenses/report/print')
  async expensesReport(
    @Query() query: QueryExpenseDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': HTML });
    return this.html.expensesReportHtml(query);
  }

  // Mali rapor: kâr/zarar + yaşlandırma (yazdırılabilir HTML) — yalnızca OWNER.
  @Roles(UserRole.OWNER)
  @Get('reports/financial/print')
  async financialReport(
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<string> {
    res.set({ 'Content-Type': HTML });
    return this.html.financialReportHtml(from, to);
  }

  // ── Excel dışa aktarım (OWNER) ──────────────────────────────────────

  @Roles(UserRole.OWNER)
  @Get('reports/aging.xlsx')
  async agingXlsx(
    @Res({ passthrough: true }) res: Response,
    @Query('customerId') customerId?: string,
    @Query('asOf') asOf?: string,
  ): Promise<StreamableFile> {
    const buf = await this.exports.agingXlsx(
      customerId,
      asOf ? new Date(asOf) : undefined,
    );
    return this.stream(res, buf, XLSX, 'yaslandirma.xlsx');
  }

  @Roles(UserRole.OWNER)
  @Get('reports/profit-loss.xlsx')
  async profitLossXlsx(
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StreamableFile> {
    const buf = await this.exports.profitLossXlsx(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
    return this.stream(res, buf, XLSX, 'kar-zarar.xlsx');
  }

  @Roles(UserRole.OWNER)
  @Get('reports/stock-value.xlsx')
  async stockValueXlsx(
    @Res({ passthrough: true }) res: Response,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<StreamableFile> {
    const buf = await this.exports.stockValueXlsx(warehouseId);
    return this.stream(res, buf, XLSX, 'stok-degeri.xlsx');
  }

  @Roles(UserRole.OWNER)
  @Get('customers/:id/ledger.xlsx')
  async ledgerXlsx(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buf = await this.exports.customerLedgerXlsx(id);
    return this.stream(res, buf, XLSX, `cari-ekstre-${id.slice(0, 8)}.xlsx`);
  }

  private stream(
    res: Response,
    buf: Buffer,
    contentType: string,
    filename: string,
    disposition: 'inline' | 'attachment' = 'attachment',
  ): StreamableFile {
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
    });
    return new StreamableFile(buf);
  }
}
