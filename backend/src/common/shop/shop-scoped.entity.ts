import { Column, Index } from 'typeorm';
import { BaseEntity } from '../entities/base.entity';

/**
 * Bir dükkâna ait kayıt. Stok, müşteri, teklif, ödeme, ayar ... hepsi
 * dükkân başınadır; X dükkânının verisi Y dükkânında görünmez.
 *
 * `shopId` elle doldurulmaz: kayıt eklenirken o anki dükkân bağlamından
 * yazılır (ShopScopeSubscriber), okuma/güncelleme/silme sorgularına da
 * kendiliğinden `shop_id = <dükkân>` koşulu eklenir (shop-scope.typeorm.ts).
 *
 * Sütun veritabanında boş geçilebilir tanımlıdır: şema senkronizasyonu dolu
 * tablolara sütunu ancak böyle ekleyebilir. Eski kayıtlar açılışta ilk
 * dükkâna atanır (shops/shop-migration.ts); yeni kayıt boş dükkânla yazılamaz.
 */
export abstract class ShopScopedEntity extends BaseEntity {
  @Index()
  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId: string;
}
