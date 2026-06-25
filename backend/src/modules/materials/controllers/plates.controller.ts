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
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { CreatePlateDto } from '../dto/create-plate.dto';
import { UpdatePlateDto } from '../dto/update-plate.dto';
import { QueryPlateDto } from '../dto/query-plate.dto';
import { UpsertSupplierPriceDto } from '../dto/upsert-supplier-price.dto';
import { PlatesService } from '../services/plates.service';
import { SupplierPricesService } from '../services/supplier-prices.service';

@ApiTags('plates')
@ApiBearerAuth()
@Controller({ path: 'plates', version: '1' })
export class PlatesController {
  constructor(
    private readonly platesService: PlatesService,
    private readonly supplierPricesService: SupplierPricesService,
  ) {}

  // Stok girişi çalışanın da yetkisindedir.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
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

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlateDto,
  ) {
    return this.platesService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.platesService.remove(id);
  }

  // ── Piyasa Fiyatları (tedarikçi bazlı) ───────────────────────────
  @Get(':id/prices')
  listPrices(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierPricesService.list(id);
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
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

  @Roles(UserRole.OWNER)
  @Delete(':id/prices/:priceId')
  removePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('priceId', ParseUUIDPipe) priceId: string,
  ) {
    return this.supplierPricesService.remove(id, priceId);
  }
}
