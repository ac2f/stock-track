import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ConvertQuoteDto } from './dto/convert-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuotesService } from './services/quotes.service';
import { ShopScope } from '../../common/shop/shop-access.decorator';

@ApiTags('quotes')
@ApiBearerAuth()
@ShopScope('quotes')
@Controller({ path: 'quotes', version: '1' })
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}
  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser('id') userId: string) {
    return this.quotesService.create(dto, userId);
  }

  @Get()
  findAll(@Query() query: QueryQuoteDto) {
    return this.quotesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateQuoteDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.quotesService.update(id, dto, userId);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.quotesService.setStatus(id, dto.status);
  }

  // ACCEPTED teklifi satış + işleme kayıtlarına dönüştürür (satışı yapan token'dan).
  @Post(':id/convert')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ConvertQuoteDto,
  ) {
    return this.quotesService.convert(id, userId, {
      completeProcessing: dto.completeProcessing ?? false,
    });
  }

  /**
   * İşe dönüşmüş teklifin klasörlerini dükkân bilgisayarından yeniden ister
   * (runner kapalıyken dönüştüyse ya da klasör silindiyse).
   */
  @Post(':id/request-folders')
  requestFolders(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.requestFolders(id);
  }

  // Teklifi sil: kuyruk işlerini + (varsa) dönüşen satışı geri alır, ekstreden düşer.
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.quotesService.remove(id);
  }
}
