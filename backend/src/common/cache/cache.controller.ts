import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import { NoShop } from '../shop/shop-access.decorator';
import { CacheService } from './cache.service';

/** Önbellek durumu ve temizleme — yalnız sistem sahibi. */
@ApiTags('system')
@ApiBearerAuth()
@NoShop()
@Roles(UserRole.OWNER)
@Controller({ path: 'system/cache', version: '1' })
export class CacheAdminController {
  constructor(private readonly cache: CacheService) {}

  /** Kip, bağlantı, isabet/ıska sayıları (grup bazında) ve Redis belleği. */
  @Get()
  async status() {
    const stats = this.cache.stats();
    const total = stats.hits + stats.misses;
    return {
      ...stats,
      hitRatio: total ? Math.round((stats.hits / total) * 1000) / 10 : null,
      redis: await this.cache.serverInfo(),
    };
  }

  /** Bütün önbellek girdilerini siler (veri bozulmaz; yalnız ilk okumalar yavaşlar). */
  @Post('flush')
  async flush() {
    return { removed: await this.cache.flushAll() };
  }
}
