import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Cached } from '../../common/cache/cached.decorator';
import { CacheGroup } from '../../common/cache/cache.groups';
import { Public } from '../../common/decorators/public.decorator';
import { GeoService } from './geo.service';

/**
 * İl / ilçe listesi. Herkese açıktır (kayıt formu oturumdan önce kullanır) ve
 * değişmez veridir: tarayıcı ve vekil önbelleği uzun tutulur.
 */
@ApiTags('geo')
@Controller({ path: 'geo', version: '1' })
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('provinces')
  @Cached({ group: CacheGroup.PLATFORM, ttl: 3600, scope: 'global' })
  provinces() {
    return this.geo.listProvinces();
  }

  /** `:key` plaka kodu ("34") ya da il adı ("İstanbul"). */
  @Public()
  @Get('provinces/:key/districts')
  @Cached({ group: CacheGroup.PLATFORM, ttl: 3600, scope: 'global' })
  districts(@Param('key') key: string) {
    const list = this.geo.listDistricts(key);
    if (!list) throw new NotFoundException('İl bulunamadı.');
    return list;
  }
}
