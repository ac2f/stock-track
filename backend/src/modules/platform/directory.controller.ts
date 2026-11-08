import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Cached } from '../../common/cache/cached.decorator';
import { CacheGroup } from '../../common/cache/cache.groups';
import { AnyShopMember, ShopFeatureRequired } from '../../common/shop/shop-access.decorator';
import { DirectoryFacetsDto, QueryDirectoryDto } from './dto/platform.dto';
import { DirectoryService } from './directory.service';
import { MachineTypesService } from './machine-types.service';

/**
 * İşletme rehberi: etkin her işletmenin her üyesi diğer işletmeleri il/ilçe,
 * iş kolu ve makine (tür + ebat) ile arayabilir. Sonuçlar herkese aynıdır:
 * platform önbelleğinde paylaşılır, rehber verisi değişince kendiliğinden silinir.
 */
@ApiTags('directory')
@ApiBearerAuth()
@AnyShopMember()
@ShopFeatureRequired('directory')
@Controller({ path: 'directory', version: '1' })
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly machineTypes: MachineTypesService,
  ) {}

  @Get('shops')
  @Cached({ group: CacheGroup.DIRECTORY, ttl: 120, scope: 'global' })
  shops(@Query() q: QueryDirectoryDto) {
    return this.directory.shops(q);
  }

  @Get('machines')
  @Cached({ group: CacheGroup.DIRECTORY, ttl: 120, scope: 'global' })
  machines(@Query() q: QueryDirectoryDto) {
    return this.directory.machines(q);
  }

  @Get('facets')
  @Cached({ group: CacheGroup.DIRECTORY, ttl: 120, scope: 'global' })
  facets(@Query() q: DirectoryFacetsDto) {
    return this.directory.facets(q.province);
  }

  /** Makine türü ağacı (ebatlarıyla): makine formu ve rehber süzgeci. */
  @Get('machine-types')
  @Cached({ group: CacheGroup.PLATFORM, ttl: 300, scope: 'global' })
  machineTypeTree() {
    return this.machineTypes.memberList();
  }
}
