import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Gönderim defteri (uygulama içi bildirim geçmişi).
  @Get()
  list(@Query('limit') limit?: string) {
    return this.notificationsService.list(limit ? Number(limit) : 50);
  }
}
