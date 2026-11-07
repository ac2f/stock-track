import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Cached } from '../../common/cache/cached.decorator';
import { CacheGroup } from '../../common/cache/cache.groups';
import { RateLimit } from '../../common/cache/rate-limit';
import { Public } from '../../common/decorators/public.decorator';
import { PrimaryOnly, SyncSkip } from '../sync/sync.decorators';
import { RegisterBusinessDto } from './dto/platform.dto';
import { LabelsService } from './labels.service';
import { PlatformSettingsService } from './platform-settings.service';
import { RegistrationService } from './registration.service';

/** Oturumdan ÖNCE kullanılan uçlar: işletme kaydı ve kayıt formunun seçenekleri. */
@ApiTags('registration')
@Controller({ path: 'registration', version: '1' })
export class RegistrationController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly labels: LabelsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** Kayıt açık mı, iş kolu etiketleri (form seçenekleri). */
  @Public()
  @Get('options')
  @Cached({ group: CacheGroup.PLATFORM, ttl: 120, scope: 'global' })
  async options() {
    const [cfg, labels] = await Promise.all([this.settings.get(), this.labels.publicList()]);
    return {
      open: cfg.registrationOpen,
      autoApprove: cfg.registrationAutoApprove,
      trialDays: cfg.trialDays,
      labels,
    };
  }

  /** Yeni işletme kaydı: kendi boş sistemini ve sahip hesabını açar. */
  @Public()
  @SyncSkip()
  @PrimaryOnly()
  @RateLimit(
    { name: 'register-ip', by: 'ip', limit: 20, windowSeconds: 3600, message: 'Bu adresten çok fazla kayıt denendi. Bir saat sonra tekrar deneyin.' },
    { name: 'register-email', by: 'none', bodyField: 'email', limit: 10, windowSeconds: 3600 },
  )
  @Post()
  @HttpCode(201)
  register(@Body() dto: RegisterBusinessDto) {
    return this.registration.register(dto);
  }
}
