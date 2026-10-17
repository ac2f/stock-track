import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators/public.decorator';

/** Veritabanı bu sürede yanıt vermezse "kapalı" sayılır. */
const DB_TIMEOUT_MS = 3000;

/**
 * Sağlık kontrolü — load balancer / orchestrator (Docker, PM2) ve
 * arayüzün çevrimdışı modu için. Veritabanına ulaşılamıyorsa 503 döner:
 * arayüz bunu "sunucu yok" sayar, işlemleri cihazda biriktirir ve sağlık
 * tekrar 200 olunca eşzamanlar.
 * Stateless: herhangi bir replika yanıtlayabilir.
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    const db = await this.pingDb();
    if (!db) throw new ServiceUnavailableException('Veritabanına ulaşılamıyor.');
    return {
      status: 'ok',
      db: 'up',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDb(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS);
      });
      await Promise.race([this.dataSource.query('SELECT 1'), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
