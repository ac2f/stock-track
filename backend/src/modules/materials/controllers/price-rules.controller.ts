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
import { ShopScope } from '../../../common/shop/shop-access.decorator';
import {
  CreatePriceRuleDto,
  PreviewPriceRuleDto,
  SetPriceRuleReferenceDto,
  UpdatePriceRuleDto,
  UpsertPriceRuleEntryDto,
} from '../dto/price-rule.dto';
import { PriceRulesService } from '../services/price-rules.service';

/**
 * Fiyat çatıları: bir grup malzemeye (tüm pleksiler, 2.8 mm pleksiler,
 * Akpolimer beyaz pleksi ...) malzemeci fiyatları ve referans fiyat.
 * Katalog alanına aittir (okuma: listeler, yazma: tanımlar).
 */
@ApiTags('price-rules')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'price-rules', version: '1' })
export class PriceRulesController {
  constructor(private readonly rules: PriceRulesService) {}

  @Get()
  list(@Query('categoryId') categoryId?: string) {
    return this.rules.list(categoryId || undefined);
  }

  /** Kaydetmeden önce: kaç kalemi kapsar, aynı kapsamda çatı var mı. */
  @Get('preview')
  preview(@Query() q: PreviewPriceRuleDto) {
    return this.rules.preview(q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rules.get(id);
  }

  @Post()
  create(@Body() dto: CreatePriceRuleDto) {
    return this.rules.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePriceRuleDto) {
    return this.rules.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rules.remove(id);
  }

  /** Malzemeci fiyatı ekle/güncelle (malzemeci başına tek satır). */
  @Put(':id/entries')
  upsertEntry(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertPriceRuleEntryDto) {
    return this.rules.upsertEntry(id, dto);
  }

  @Delete(':id/entries/:entryId')
  removeEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.rules.removeEntry(id, entryId);
  }

  /** Referans malzemeciyi seç (entryId boşsa en ucuz). */
  @Put(':id/reference')
  setReference(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPriceRuleReferenceDto) {
    return this.rules.setReference(id, dto.entryId ?? null);
  }
}
