import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateProcessingJobDto } from '../dto/create-processing-job.dto';
import { QueryProcessingJobDto } from '../dto/query-processing-job.dto';
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

  @Get()
  findAll(@Query() query: QueryProcessingJobDto) {
    return this.processingService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.processingService.findOne(id);
  }
}
