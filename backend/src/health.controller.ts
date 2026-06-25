import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

/**
 * Sağlık kontrolü — load balancer / orchestrator (Docker, PM2) için.
 * Stateless: herhangi bir replika yanıtlayabilir.
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
