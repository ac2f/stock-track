import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceGroup } from './entities/service-group.entity';
import { ServiceType } from './entities/service-type.entity';
import { ServiceTier } from './entities/service-tier.entity';
import { ServiceBundle } from './entities/service-bundle.entity';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogService } from './service-catalog.service';

/** Hizmet kataloğu (harf büküm, harf yapıştırma, montaj …), kademeli fiyat ve kombinasyon indirimi. */
@Module({
  imports: [TypeOrmModule.forFeature([ServiceGroup, ServiceType, ServiceTier, ServiceBundle])],
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
