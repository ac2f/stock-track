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
import { ConfigService } from '@nestjs/config';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { QueryCustomerDto } from '../dto/query-customer.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { ApplyDiscountDto, SettleDebtDto } from '../dto/apply-discount.dto';
import { CustomersService } from '../services/customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  private readonly portalBaseUrl: string;

  constructor(
    private readonly customersService: CustomersService,
    configService: ConfigService,
  ) {
    this.portalBaseUrl =
      configService.get<string>('business.portalBaseUrl') ??
      'http://localhost:5173/portal';
  }

  // Çalışan yeni müşteri açabilir (ör. tahsilat öncesi cari oluşturma).
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
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

  // Cari hareket dökümü (geçmişe dönük borç izleme).
  @Get(':id/ledger')
  ledger(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.getLedger(id);
  }

  // #8b Cariye elle (geçmiş tarihli) borç/alacak hareketi ekle (yalnızca Sahip).
  @Roles(UserRole.OWNER)
  @Post(':id/ledger-entry')
  addLedgerEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLedgerEntryDto,
  ) {
    return this.customersService.addLedgerEntry(id, dto);
  }

  // #5 İndirim (borç kapatma/yuvarlama) — ekstrede "İndirim" olarak görünür.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Post(':id/discount')
  applyDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.customersService.applyDiscount(id, dto);
  }

  // #5 Borcu kapat: tahsil edilen tutar + kalan fark indirim (tek transaction).
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Post(':id/settle')
  settleDebt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleDebtDto,
  ) {
    return this.customersService.settleDebt(id, dto);
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.remove(id);
  }

  // Müşteri portalı için salt-okunur paylaşılabilir bağlantı üretir/yeniler.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Post(':id/portal-token')
  async issuePortalToken(@Param('id', ParseUUIDPipe) id: string) {
    const token = await this.customersService.issuePortalToken(id);
    return { token, url: `${this.portalBaseUrl}/${token}` };
  }

  // Portal erişimini iptal eder.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Delete(':id/portal-token')
  revokePortalToken(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.revokePortalToken(id);
  }
}
