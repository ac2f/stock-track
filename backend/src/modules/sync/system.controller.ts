import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { NoShop } from '../../common/shop/shop-access.decorator';
import { OutboxQueryDto } from './dto/sync.dto';
import { SyncSkip } from './sync.decorators';
import { SystemService } from './system.service';

/** Sunucunun rolü (merkez/yerel) ve yerel sunucuda eşitleme durumu. */
@ApiTags('system')
@NoShop()
@SyncSkip()
@Controller({ path: 'system', version: '1' })
export class SystemController {
  constructor(private readonly system: SystemService) {}

  /** Oturum gerektirmez: giriş ekranı "yerel sunucu, henüz hazır değil" diyebilsin. */
  @Public()
  @Get('info')
  info() {
    return this.system.info();
  }

  @Get('sync')
  status() {
    return this.system.status();
  }

  @Get('sync/outbox')
  outbox(@CurrentUser() user: AuthenticatedUser, @Query() q: OutboxQueryDto) {
    return this.system.outbox(user, q);
  }

  @Post('sync/outbox/:id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.system.retry(user, id);
  }

  @Post('sync/outbox/:id/discard')
  @HttpCode(200)
  discard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.system.discard(user, id);
  }
}
