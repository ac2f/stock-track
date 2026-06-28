import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AgingQueryDto,
  ReportQueryDto,
  TopListQueryDto,
} from './dto/report-query.dto';
import { DashboardService } from './services/dashboard.service';
import { FinancialReportsService } from './services/financial-reports.service';
import { InventoryReportsService } from './services/inventory-reports.service';

/** Mali raporlar — yalnızca İşletme Sahibi (OWNER). */
@ApiTags('reports')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  private readonly baseCurrency: string;

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly financialReports: FinancialReportsService,
    private readonly inventoryReports: InventoryReportsService,
    configService: ConfigService,
  ) {
    this.baseCurrency =
      configService.get<string>('currency.base') ??
      configService.get<string>('business.defaultCurrency') ??
      'TRY';
  }

  @Get('dashboard')
  dashboard(@Query() query: ReportQueryDto) {
    return this.dashboardService.summary(
      this.baseCurrency,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @Get('aging')
  aging(@Query() query: AgingQueryDto) {
    return this.financialReports.aging(
      query.customerId,
      query.asOf ? new Date(query.asOf) : undefined,
    );
  }

  @Get('profit-loss')
  profitLoss(@Query() query: ReportQueryDto) {
    return this.financialReports.profitLoss(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @Get('top-debtors')
  topDebtors(@Query() query: TopListQueryDto) {
    return this.financialReports.topDebtors(query.limit);
  }

  @Get('top-creditors')
  topCreditors(@Query() query: TopListQueryDto) {
    return this.financialReports.topCreditors(query.limit);
  }

  @Get('stock-value')
  stockValue(@Query() query: ReportQueryDto) {
    return this.inventoryReports.stockValue(query.warehouseId);
  }
}
