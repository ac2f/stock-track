import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { ShopMember } from './entities/shop-member.entity';
import { Shop } from './entities/shop.entity';
import { ShopAccessService } from './shop-access.service';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

/**
 * Dükkânlar, üyelikler ve dükkân erişimi. Global: erişim servisi her
 * modülün guard'ı ve zamanlanmış görevleri tarafından kullanılır.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Shop, ShopMember, User])],
  controllers: [ShopsController],
  providers: [ShopAccessService, ShopsService],
  exports: [ShopAccessService, ShopsService],
})
export class ShopsModule {}
