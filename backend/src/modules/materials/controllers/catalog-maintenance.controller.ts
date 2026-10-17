import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CatalogDedupeService } from '../services/catalog-dedupe.service';
import { ShopScope } from '../../../common/shop/shop-access.decorator';

/**
 * Katalog bakımı (yalnızca İşletme Sahibi): geçmişte oluşmuş tür/marka/renk/
 * ebat/kalınlık/şablon kopyalarını bulur ve birleştirir.
 *
 * Birleştirme yıkıcı DEĞİLDİR: kopyalara bağlı stok, teklif, satış ve cari
 * kayıtları korunan katalog satırına taşınır, hiçbiri silinmez.
 */
@ApiTags('materials')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'material-catalog', version: '1' })
export class CatalogMaintenanceController {
  constructor(private readonly dedupe: CatalogDedupeService) {}

  /** Kopyaları yalnızca listeler — hiçbir şey değiştirmez (ön izleme). */
  @Get('duplicates')
  preview() {
    return this.dedupe.preview();
  }

  /** Kopyaları birleştirir; sonuç raporunu döner. */
  @Post('dedupe')
  apply() {
    return this.dedupe.applyUntilStable();
  }
}
