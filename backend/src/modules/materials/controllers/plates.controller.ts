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
import { PlateIntakeService } from '../services/plate-intake.service';
import { SetRetailPriceDto } from '../dto/set-retail-price.dto';
import { BatchCreatePlatesDto } from '../dto/batch-create-plates.dto';
import { SupplierPricesService } from '../services/supplier-prices.service';
import { ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('plates')
@ApiBearerAuth()
@ShopScope('stock')
@Controller({ path: 'plates', version: '1' })
export class PlatesController {
  constructor(
    private readonly platesService: PlatesService,
    private readonly supplierPricesService: SupplierPricesService,
    private readonly pricingService: PricingService,
    private readonly intakeService: PlateIntakeService,
  ) {}

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

  /**
   * Aynı türdeki (marka/renk farklı olabilir) fiyatı tanımlı malzemeler —
   * fiyatı olmayan bir malzemeye "aynısını uygula" için.
   */
  @Get(':id/retail-suggestions')
  retailSuggestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.retailSuggestions(id);
  }
}
