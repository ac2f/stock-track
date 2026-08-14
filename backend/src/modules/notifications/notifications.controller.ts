import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { TelegramChannel } from './channels/telegram.channel';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly telegram: TelegramChannel,
  ) {}

  // Gönderim defteri (uygulama içi bildirim geçmişi).
  @Get()
  list(@Query('limit') limit?: string) {
    return this.notificationsService.list(limit ? Number(limit) : 50);
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
}
