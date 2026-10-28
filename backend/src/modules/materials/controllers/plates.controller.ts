import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { CreatePlateDto } from '../dto/create-plate.dto';
import { UpdatePlateDto } from '../dto/update-plate.dto';
import { QueryPlateDto } from '../dto/query-plate.dto';
import { TransferOwnershipDto } from '../dto/transfer-ownership.dto';
import { UpsertSupplierPriceDto } from '../dto/upsert-supplier-price.dto';
import { PlatesService } from '../services/plates.service';
import { PricingService } from '../services/pricing.service';
import { PlateCostService } from '../services/plate-cost.service';
import { PlateIntakeService } from '../services/plate-intake.service';
import { SetRetailPriceDto } from '../dto/set-retail-price.dto';
import { BatchCreatePlatesDto } from '../dto/batch-create-plates.dto';
import { EnsureTemplateDto } from '../dto/ensure-template.dto';
import { SupplierPricesService } from '../services/supplier-prices.service';
import { ShopScope } from '../../../common/shop/shop-access.decorator';

/** `?ids=a,b` → geçerli UUID'ler (tekrarsız, en çok `max` adet). */
export function parseIds(ids: string | undefined, max: number): string[] {
  const out = (ids ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x));
  return [...new Set(out)].slice(0, max);
}

@ApiTags('plates')
@ApiBearerAuth()
@ShopScope('stock')
@Controller({ path: 'plates', version: '1' })
export class PlatesController {
  constructor(
    private readonly platesService: PlatesService,
    private readonly supplierPricesService: SupplierPricesService,
    private readonly pricingService: PricingService,
    private readonly plateCostService: PlateCostService,
    private readonly intakeService: PlateIntakeService,
  ) {}

  /**
   * Ürün türünü özelliklerinden bul/aç ("bu ürün türü yok, kaydet"). Stok
   * eklemede ve teklif formunda arama boş çıkınca kullanılır.
   */
  @Post('ensure-template')
  ensureTemplate(@Body() dto: EnsureTemplateDto) {
    return this.intakeService.ensureTemplate(dto);
  }

  /**
   * Tek istekte birden çok stok kalemi. Katalog kayıtları (tür/marka/renk/
   * ebat/kalınlık) ADLA verilebilir; yoksa kendiliğinden açılır ve yanıtta
   * hangilerinin açıldığı raporlanır.
   */
  @Post('batch')
  createBatch(@Body() dto: BatchCreatePlatesDto) {
    return this.intakeService.createBatch(dto);
  }

  // Stok girişi çalışanın da yetkisindedir.
  @Post()
  create(@Body() dto: CreatePlateDto) {
    return this.platesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryPlateDto) {
    return this.platesService.findAll(query);
  }

  /**
   * Alış maliyetleri (satın almalardan): `?ids=a,b`. Satış kaleminde ve
   * teklif kartında kâr bundan hesaplanır.
   */
  @Get('costs')
  costs(@Query('ids') ids?: string) {
    return this.plateCostService.forPlates(parseIds(ids, 200));
  }

  /**
   * Toplu fiyatlandırma: `?ids=a,b` (en çok 100; geçersiz kimlikler yok
   * sayılır) → `{ [plateId]: PlatePricing }`. Seçici listesi satır başına ayrı
   * istek atmak yerine görünen kalemlerin fiyatını tek seferde alır.
   */
  @Get('pricing')
  pricingBatch(@Query('ids') ids?: string) {
    return this.pricingService.forPlates(parseIds(ids, 100));
  }

  /**
   * Dükkânda şu an stoğu olan konsinye sahipleri: `[{ id, name }]`. Stok
   * listesindeki sahip süzgeci için (tüm müşteri listesi çekilmez).
   */
  @Get('owners')
  owners() {
    return this.platesService.stockOwners();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.platesService.findOne(id);
  }

  // Depo/sahip bazlı stok seviyeleri (konsinye dahil).
  @Get(':id/stock-levels')
  stockLevels(@Param('id', ParseUUIDPipe) id: string) {
    return this.platesService.listStockLevels(id);
  }

  // Stok sahipliğini taraflar arasında serbestçe aktar (işletme↔müşteri, müşteri↔müşteri).
  @Post(':id/transfer-ownership')
  transferOwnership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.platesService.transferOwnership(id, dto);
  }

  // "Tamamını sat" / stoktan tamamen çıkar (soft-delete).
  @Post(':id/deplete')
  deplete(@Param('id', ParseUUIDPipe) id: string) {
    return this.platesService.deplete(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlateDto,
  ) {
    return this.platesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.platesService.remove(id);
  }

  // ── Piyasa Fiyatları (tedarikçi bazlı) ───────────────────────────
  @Get(':id/prices')
  listPrices(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierPricesService.list(id);
  }

  @Put(':id/prices')
  upsertPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertSupplierPriceDto,
  ) {
    return this.supplierPricesService.upsert(id, dto);
  }

  @Get(':id/prices/compare')
  comparePrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('unit') unit?: PriceUnit,
  ) {
    return this.supplierPricesService.compare(id, unit);
  }

  @Delete(':id/prices/:priceId')
  removePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('priceId', ParseUUIDPipe) priceId: string,
  ) {
    return this.supplierPricesService.remove(id, priceId);
  }

  /**
   * Satış fiyatı önerisi: perakende fiyat + kâr yüzdesi, malzemeci
   * fiyatlarıyla karşılaştırma ve (varsa) indirim yüzdesi.
   */
  @Get(':id/pricing')
  pricing(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.forPlate(id);
  }

  /** Perakende fiyatı girer/günceller (TRY varsayılan; USD/EUR de olabilir). */
  @Put(':id/retail-price')
  setRetailPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRetailPriceDto,
  ) {
    return this.pricingService.setRetailPrice(id, dto);
  }

  /** Kalemin kendi fiyatını kaldırır; öneri (varsa) fiyat çatısından gelir. */
  @Delete(':id/retail-price')
  clearRetailPrice(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.clearRetailPrice(id);
  }

  /**
   * Aynı türdeki (marka/renk farklı olabilir) fiyatı tanımlı malzemeler —
   * fiyatı olmayan bir malzemeye "aynısını uygula" için.
   */
  @Get(':id/retail-suggestions')
  retailSuggestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.retailSuggestions(id);
  }
}
