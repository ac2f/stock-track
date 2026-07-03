import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { BackupsService } from './backups.service';

/** FileInterceptor bellek-depolamalı dosya (varsayılan) — buffer'lı. */
interface UploadedBackupFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

@ApiTags('backups')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ path: 'backups', version: '1' })
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  /** Diskteki kalıcı (otomatik) yedeklerin listesi. */
  @Get()
  list() {
    return this.backups.list();
  }

  /** Anlık yedek üretir ve .sql dosyasını indirir. */
  @Get('download')
  async download(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, size } = await this.backups.createDownloadable();
    res.set({
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(size),
    });
    return new StreamableFile(stream);
  }

  /**
   * Yüklenen .sql yedeğini geri yükler (TEHLİKELİ: mevcut veriyi üzerine yazar).
   * Yalnızca owner; arayüzde çift onay istenir.
   */
  @Post('restore')
  @UseInterceptors(FileInterceptor('file'))
  async restore(
    @UploadedFile() file?: UploadedBackupFile,
  ): Promise<{ restored: true }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Yedek dosyası (file) gerekli.');
    }
    await this.backups.restore(file.buffer);
    return { restored: true };
  }
}
