import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuotesService } from './services/quotes.service';

@ApiTags('quotes')
@ApiBearerAuth()
@Controller({ path: 'quotes', version: '1' })
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Post()
  create(@Body() dto: CreateQuoteDto) {
    return this.quotesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryQuoteDto) {
    return this.quotesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findOne(id);
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateQuoteDto) {
    return this.quotesService.update(id, dto);
  }

  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.quotesService.setStatus(id, dto.status);
  }

  // ACCEPTED teklifi satış + işleme kayıtlarına dönüştürür (satışı yapan token'dan).
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Post(':id/convert')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.quotesService.convert(id, userId);
  }
}
