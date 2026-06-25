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
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CreateProcessingRateDto } from '../dto/create-processing-rate.dto';
import { UpdateProcessingRateDto } from '../dto/update-processing-rate.dto';
import { ProcessingRatesService } from '../services/processing-rates.service';

@ApiTags('processing-rates')
@ApiBearerAuth()
@Controller({ path: 'processing-rates', version: '1' })
export class ProcessingRatesController {
  constructor(private readonly ratesService: ProcessingRatesService) {}

  // m² fiyat şablonu mali bir ayardır → tanım/değişiklik yalnızca Sahip.
  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateProcessingRateDto) {
    return this.ratesService.create(dto);
  }

  // Çalışan işleme kaydında şablonu seçebilmek için listeyi görür.
  @Get()
  findAll() {
    return this.ratesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ratesService.findOne(id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessingRateDto,
  ) {
    return this.ratesService.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ratesService.remove(id);
  }
}
