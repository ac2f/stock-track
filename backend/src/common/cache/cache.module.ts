import { Global, Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { installCacheInvalidation } from './cache-invalidation';
import { CacheAdminController } from './cache.controller';
import { CacheService } from './cache.service';
import { HttpCacheInterceptor } from './http-cache.interceptor';
import { RateLimitGuard } from './rate-limit';

/**
 * Önbellek ve hız sınırı (Redis, yoksa bellek). Genel modüldür: her modül
 * `CacheService` enjekte edebilir. Veritabanı yazma yakalayıcısı açılışta kurulur.
 */
@Global()
@Module({
  controllers: [CacheAdminController],
  providers: [CacheService, HttpCacheInterceptor, RateLimitGuard],
  exports: [CacheService, HttpCacheInterceptor, RateLimitGuard],
})
export class CacheModule implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  onApplicationBootstrap(): void {
    installCacheInvalidation(this.dataSource, this.cache);
  }
}
