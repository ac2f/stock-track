import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrencyService } from './currency.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';

@ApiTags('currency')
@ApiBearerAuth()
@Controller({ path: 'exchange-rates', version: '1' })
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  // Kur tanımı mali bir ayardır → yalnızca Sahip.
  @Roles(UserRole.OWNER)
  @Post()
  upsert(@Body() dto: CreateExchangeRateDto) {
    return this.currencyService.upsert(dto);
  }

  @Get()
  list() {
    return this.currencyService.list();
  }

  // Yardımcı: anlık çevirim sorgusu.
  @Get('convert')
  convert(
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.currencyService.convert(Number(amount), from, to);
  }
}
