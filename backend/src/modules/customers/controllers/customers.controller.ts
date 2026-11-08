import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { QueryCustomerDto } from '../dto/query-customer.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { ApplyDiscountDto, SettleDebtDto } from '../dto/apply-discount.dto';
import { QueryStatementDto } from '../dto/query-statement.dto';
import { CustomersService } from '../services/customers.service';
import { ShopAccess, ShopScope } from '../../../common/shop/shop-access.decorator';
import { SettingsService } from '../../settings/settings.service';

@ApiTags('customers')
@ApiBearerAuth()
@ShopScope('customers')
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly settings: SettingsService,
  ) {}

  // Çalışan yeni müşteri açabilir (ör. tahsilat öncesi cari oluşturma).
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryCustomerDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findOne(id);
  }

  // Cari hareket dökümü (tüm geçmiş).
  @ShopAccess('payments', 'read')
  @Get(':id/ledger')
  ledger(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.getLedger(id);
  }

  /**
   * Dönemlenmiş cari ekstre. Varsayılan: borcun en son kapandığı andan bugüne.
   * `?scope=all` tüm geçmişi, `?from=&to=` serbest aralığı verir (borç
   * kapanmadan öncesi de görülebilir). Dönem başı bakiyesi devir olarak döner.
   */
  @ShopAccess('payments', 'read')
  @Get(':id/statement')
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryStatementDto,
  ) {
    return this.customersService.getStatement(id, query);
  }

  // #8b Cariye elle (geçmiş tarihli) borç/alacak hareketi ekle (yalnızca Sahip).
  @ShopAccess('payments', 'write')
  @Post(':id/ledger-entry')
  addLedgerEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLedgerEntryDto,
  ) {
    return this.customersService.addLedgerEntry(id, dto);
  }

  // Yanlış girilen cari hareketini geri al (ödeme/indirim/manuel).
  // Çalışan yalnızca son günlerdekini, Sahip her zaman geri alabilir.
  @ShopAccess('payments', 'write')
  @Delete(':id/ledger/:entryId')
  removeLedgerEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.customersService.removeLedgerEntry(id, entryId, role);
  }

  // #5 İndirim (borç kapatma/yuvarlama) — ekstrede "İndirim" olarak görünür.
  @ShopAccess('payments', 'write')
  @Post(':id/discount')
  applyDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.customersService.applyDiscount(id, dto);
  }

  // #5 Borcu kapat: tahsil edilen tutar + kalan fark indirim (tek transaction).
  @ShopAccess('payments', 'write')
  @Post(':id/settle')
  settleDebt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleDebtDto,
  ) {
    return this.customersService.settleDebt(id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.remove(id);
  }

  // Müşteri portalı için salt-okunur paylaşılabilir bağlantı üretir/yeniler.
  @Post(':id/portal-token')
  async issuePortalToken(@Param('id', ParseUUIDPipe) id: string) {
    const token = await this.customersService.issuePortalToken(id);
    // Temel adres sistem sahibinin ayarıdır (işletme değiştiremez): bağlantı hep güvenilir adrese gider.
    const { portalBaseUrl } = await this.settings.getBusiness();
    return { token, url: `${portalBaseUrl.replace(/\/+$/, '')}/${token}` };
  }

  // Portal erişimini iptal eder.
  @Delete(':id/portal-token')
  revokePortalToken(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.revokePortalToken(id);
  }
}
