import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { BankAccountsService } from './bank-accounts.service';
import { AnyShopMember, ShopScope } from '../../common/shop/shop-access.decorator';

@ApiTags('bank-accounts')
@ApiBearerAuth()
@ShopScope('banking')
@Controller({ path: 'bank-accounts', version: '1' })
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  // Banka hesabı tanımı mali bir ayardır → yalnızca Sahip.
  @Post()
  create(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.create(dto);
  }

  // Çalışan da havale tahsilatı kaydederken listelemeye ihtiyaç duyar.
  @AnyShopMember()
  @Get()
  findAll() {
    return this.bankAccountsService.findAll();
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankAccountsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankAccountsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankAccountsService.remove(id);
  }
}
