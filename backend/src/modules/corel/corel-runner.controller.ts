import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnyShopMember, ShopFeatureRequired, ShopScope } from '../../common/shop/shop-access.decorator';
import { CorelRunnerService } from './corel-runner.service';
import { CorelCutReportService } from './corel-cut-report.service';

/**
 * Oturumla okunan runner durumu: Ayarlar › Corel entegrasyonu ve teklif
 * ekranı "runner bağlı mı" bilgisini buradan alır.
 */
@ApiTags('corel')
@ApiBearerAuth()
@ShopScope('settings')
@ShopFeatureRequired('corel')
@Controller({ path: 'corel-runners', version: '1' })
export class CorelRunnerController {
  constructor(
    private readonly runners: CorelRunnerService,
    private readonly cutReportService: CorelCutReportService,
  ) {}

  @AnyShopMember()
  @Get()
  list() {
    return this.runners.list();
  }

  /** Bir teklifin iyiCAM kesim raporları (yeniden eskiye). */
  @AnyShopMember()
  @Get('cut-reports/:quoteId')
  cutReports(@Param('quoteId', ParseUUIDPipe) quoteId: string) {
    return this.cutReportService.list(quoteId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.runners.remove(id);
  }
}
