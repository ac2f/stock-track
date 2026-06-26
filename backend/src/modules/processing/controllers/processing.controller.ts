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
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateProcessingJobDto } from '../dto/create-processing-job.dto';
import { QueryProcessingJobDto } from '../dto/query-processing-job.dto';
import { UpdateProcessingStatusDto } from '../dto/update-processing-status.dto';
import { ProcessingService } from '../services/processing.service';

@ApiTags('processing')
@ApiBearerAuth()
@Controller({ path: 'processing', version: '1' })
export class ProcessingController {
  constructor(private readonly processingService: ProcessingService) {}

  // İşleme kaydı çalışanın yetkisindedir; işlemi yapan token'dan alınır.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
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

  @Get()
  findAll(@Query() query: QueryProcessingJobDto) {
    return this.processingService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.processingService.findOne(id);
  }

  // Durum değişimi: tamamlama stok düşer + ertelenmiş faturayı keser; iptal iade eder.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessingStatusDto,
  ) {
    return this.processingService.setStatus(id, dto.status);
  }
}
