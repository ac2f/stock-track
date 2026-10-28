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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateProcessingJobDto } from '../dto/create-processing-job.dto';
import { QueryProcessingJobDto } from '../dto/query-processing-job.dto';
import { BulkUpdateProcessingJobsDto } from '../dto/bulk-update-processing-jobs.dto';
import { UpdateProcessingStatusDto } from '../dto/update-processing-status.dto';
import { UpdateProcessingJobDto } from '../dto/update-processing-job.dto';
import { ProcessingService } from '../services/processing.service';
import { ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('processing')
@ApiBearerAuth()
@ShopScope('processing')
@Controller({ path: 'processing', version: '1' })
export class ProcessingController {
  constructor(private readonly processingService: ProcessingService) {}

  // İşleme kaydı çalışanın yetkisindedir; işlemi yapan token'dan alınır.
  @Post()
  create(
    @Body() dto: CreateProcessingJobDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.processingService.create(dto, userId);
  }

  // Üretim kuyruğu: aktif işler makineye göre gruplanır.
  @Get('queue')
  queue(@Query() query: QueryProcessingJobDto) {
    return this.processingService.queue(query);
  }

  /** Menü rozeti: kuyruktaki iş sayısı → `{ count }`. */
  @Get('queue/count')
  queueCount() {
    return this.processingService.queueCount();
  }

  /** Kuyruktaki işlerin plaka kimlikleri → `string[]` (teklif formu uyarısı). */
  @Get('queue/plate-ids')
  queuePlateIds() {
    return this.processingService.queuePlateIds();
  }

  @Get()
  findAll(@Query() query: QueryProcessingJobDto) {
    return this.processingService.findAll(query);
  }

  // Geçmiş işlerin toplu düzenlemesi (tarih/not). `:id` yolundan ÖNCE tanımlı.
  @Patch('bulk')
  bulkUpdate(@Body() dto: BulkUpdateProcessingJobsDto) {
    return this.processingService.bulkUpdate(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.processingService.findOne(id);
  }

  // Durum değişimi: tamamlama stok düşer + ertelenmiş faturayı keser; iptal iade eder.
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessingStatusDto,
  ) {
    return this.processingService.setStatus(id, dto.status, {
      finalAmount: dto.finalAmount,
      offcutWidthMm: dto.offcutWidthMm,
      offcutHeightMm: dto.offcutHeightMm,
      processedAt: dto.processedAt,
      completedAt: dto.completedAt,
    });
  }

  // Tamamlanmış/var olan işin düzenlenebilir alanları (tarihler + not).
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessingJobDto,
  ) {
    return this.processingService.update(id, dto);
  }

  // Geçmiş işi sil: stoğu iade eder + cari hareketi ekstreden düşer.
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.processingService.remove(id);
  }
}
