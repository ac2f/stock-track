import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PortalService } from './portal.service';

/**
 * Müşteri portalı — kimlik doğrulamasız (Public). Erişim tahmin edilemez
 * token ile sağlanır; tüm uçlar salt-okunur ve müşteriye kapsanmıştır.
 */
@ApiTags('portal')
@Controller({ path: 'portal', version: '1' })
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Public()
  @Get(':token')
  summary(@Param('token') token: string) {
    return this.portalService.summary(token);
  }

  @Public()
  @Get(':token/ledger')
  ledger(@Param('token') token: string) {
    return this.portalService.ledger(token);
  }

  @Public()
  @Get(':token/documents')
  documents(@Param('token') token: string) {
    return this.portalService.documents(token);
  }
}
