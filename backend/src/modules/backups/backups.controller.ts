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
import { BackupCryptoService } from './backup-crypto.service';
import { TelegramBackupService } from './telegram-backup.service';

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
  constructor(
    private readonly backups: BackupsService,
    private readonly crypto: BackupCryptoService,
    private readonly telegramBackups: TelegramBackupService,
  ) {}

  /** Diskteki kalıcı (otomatik) yedeklerin listesi. */
  @Get()
  list() {
    return this.backups.list();
  }

  /**
   * Şifreli yedeği ELLE alıp Telegram'a gönderir (aynı gün mesajını ilerletir).
   * Web arayüzündeki "Telegram'a gönder" düğmesi bunu çağırır.
   */
  @Post('telegram')
  sendToTelegram() {
    return this.telegramBackups.runAndSend('manual');
  }

  /** O güne ait Telegram yedek durumu (mesaj id, gün, yedek dökümü). */
  @Get('telegram/state')
  telegramState() {
    return this.telegramBackups.getState();
  }

  /**
   * Şifre çözme (private) anahtarı — web arayüzünde gösterilir. Bu anahtarla,
   * Telegram'a giden veya indirilen şifreli (.enc) yedekler çözülür.
   */
  @Get('decryption-key')
  async decryptionKey() {
    const [privateKeyPem, publicKeyFingerprint] = await Promise.all([
      this.crypto.getPrivateKeyPem(),
      this.crypto.getPublicKeyFingerprint(),
    ]);
    return { privateKeyPem, publicKeyFingerprint };
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
