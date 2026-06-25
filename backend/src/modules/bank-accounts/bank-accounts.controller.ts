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
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { BankAccountsService } from './bank-accounts.service';

@ApiTags('bank-accounts')
@ApiBearerAuth()
@Controller({ path: 'bank-accounts', version: '1' })
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  // Banka hesabı tanımı mali bir ayardır → yalnızca Sahip.
  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.create(dto);
  }

  // Çalışan da havale tahsilatı kaydederken listelemeye ihtiyaç duyar.
  @Get()
  findAll() {
    return this.bankAccountsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankAccountsService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankAccountsService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankAccountsService.remove(id);
  }
}
