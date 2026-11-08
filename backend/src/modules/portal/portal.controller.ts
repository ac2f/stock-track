import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/cache/rate-limit';
import { Public } from '../../common/decorators/public.decorator';
import { PortalService } from './portal.service';

/**
 * Müşteri portalı — kimlik doğrulamasız (Public). Erişim tahmin edilemez
 * token ile sağlanır; tüm uçlar salt-okunur ve müşteriye kapsanmıştır.
 */
/** Herkese açık uçlar için ortak sınır: IP başına dakikada 120 (jeton tahmini ve tarama denemesine karşı). */
const PORTAL_LIMIT = {
  name: 'portal-ip',
  by: 'ip' as const,
  limit: 120,
  windowSeconds: 60,
  message: 'Çok sık istek yapıldı. Bir dakika sonra tekrar deneyin.',
};

@ApiTags('portal')
@Controller({ path: 'portal', version: '1' })
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Public()
  @RateLimit(PORTAL_LIMIT)
  @Get(':token')
  summary(@Param('token') token: string) {
    return this.portalService.summary(token);
  }

  @Public()
  @RateLimit(PORTAL_LIMIT)
  @Get(':token/ledger')
  ledger(@Param('token') token: string) {
    return this.portalService.ledger(token);
  }

  @Public()
  @RateLimit(PORTAL_LIMIT)
  @Get(':token/documents')
  documents(@Param('token') token: string) {
    return this.portalService.documents(token);
  }
}
