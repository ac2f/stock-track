import { Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { TelegramChannel } from './channels/telegram.channel';
import { NotificationsService } from './notifications.service';
import { MorningSummaryService } from './morning-summary.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly telegram: TelegramChannel,
    private readonly morningSummary: MorningSummaryService,
  ) {}

  // Gönderim defteri (uygulama içi bildirim geçmişi).
  @Get()
  list(@Query('limit') limit?: string) {
    return this.notificationsService.list(limit ? Number(limit) : 50);
  }

  /** Defterin büyüklüğü — bakım ekranında gösterilir. */
  @Get('stats')
  stats() {
    return this.notificationsService.stats();
  }

  /**
   * Bildirim defterini temizler. `?olderThanDays=30` yalnızca eskileri siler;
   * parametresiz tümünü boşaltır. Yalnızca gönderim geçmişidir — iş verisi
   * (cari, stok, ödeme) etkilenmez.
   */
  @Delete()
  clear(@Query('olderThanDays') olderThanDays?: string) {
    const days = olderThanDays ? Number(olderThanDays) : undefined;
    return this.notificationsService.clear(
      Number.isFinite(days) ? days : undefined,
    );
  }

  /**
   * Telegram'ı "yeniden başlatır": ayarları yeniden okur ve jetonu getMe ile
   * doğrular. Bot adını ve mesajların gideceği sohbet kimliklerini döndürür.
   */
  @Post('telegram/reload')
  reloadTelegram() {
    return this.telegram.verify();
  }

  /** Ayarlardaki sohbete deneme mesajı gönderir. */
  @Post('telegram/test')
  testTelegram() {
    return this.telegram.sendTest();
  }

  /** Sabah özetinin bugünkü hâli (göndermeden). */
  @Get('morning-summary')
  async previewMorningSummary() {
    return { text: await this.morningSummary.build() };
  }

  /** Sabah özetini şimdi Telegram'a gönderir. */
  @Post('morning-summary/send')
  async sendMorningSummary() {
    return { text: await this.morningSummary.send() };
  }
}
