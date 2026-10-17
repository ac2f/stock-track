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
import { CreateProcessingRateDto } from '../dto/create-processing-rate.dto';
import { UpdateProcessingRateDto } from '../dto/update-processing-rate.dto';
import { ProcessingRatesService } from '../services/processing-rates.service';
import { AnyShopMember, ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('processing-rates')
@ApiBearerAuth()
@ShopScope('catalog')
@Controller({ path: 'processing-rates', version: '1' })
export class ProcessingRatesController {
  constructor(private readonly ratesService: ProcessingRatesService) {}

  // m² fiyat şablonu mali bir ayardır → tanım/değişiklik yalnızca Sahip.
  @Post()
  create(@Body() dto: CreateProcessingRateDto) {
    return this.ratesService.create(dto);
  }

  // Çalışan işleme kaydında şablonu seçebilmek için listeyi görür.
  @AnyShopMember()
  @Get()
  findAll() {
    return this.ratesService.findAll();
  }

  @AnyShopMember()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ratesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessingRateDto,
  ) {
    return this.ratesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ratesService.remove(id);
  }
}
