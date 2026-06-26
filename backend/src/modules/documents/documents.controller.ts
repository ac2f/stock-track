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
import { PdfService } from './services/pdf.service';
import { ExportService } from './services/export.service';

const PDF = 'application/pdf';
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('documents')
@ApiBearerAuth()
@Controller({ version: '1' })
export class DocumentsController {
  constructor(
    private readonly pdf: PdfService,
    private readonly exports: ExportService,
  ) {}

  // ── PDF belgeler (OWNER + EMPLOYEE) ─────────────────────────────────

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('sales/:id/pdf')
  async saleInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buf = await this.pdf.saleInvoice(id);
    return this.stream(res, buf, PDF, `satis-${id.slice(0, 8)}.pdf`, 'inline');
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('processing/:id/pdf')
  async processingReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buf = await this.pdf.processingReceipt(id);
    return this.stream(res, buf, PDF, `isleme-${id.slice(0, 8)}.pdf`, 'inline');
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('quotes/:id/pdf')
  async quote(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buf = await this.pdf.quote(id);
    return this.stream(res, buf, PDF, `teklif-${id.slice(0, 8)}.pdf`, 'inline');
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Get('customers/:id/statement.pdf')
  async statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buf = await this.pdf.customerStatement(id);
    return this.stream(res, buf, PDF, `ekstre-${id.slice(0, 8)}.pdf`, 'inline');
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
