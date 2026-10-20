import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnyShopMember, ShopScope } from '../../common/shop/shop-access.decorator';
import { CorelRunnerService } from './corel-runner.service';

/**
 * Oturumla okunan runner durumu: Ayarlar › Corel entegrasyonu ve teklif
 * ekranı "runner bağlı mı" bilgisini buradan alır.
 */
@ApiTags('corel')
@ApiBearerAuth()
@ShopScope('settings')
@Controller({ path: 'corel-runners', version: '1' })
export class CorelRunnerController {
  constructor(private readonly runners: CorelRunnerService) {}

  @AnyShopMember()
  @Get()
  list() {
    return this.runners.list();
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.runners.remove(id);
  }
}
