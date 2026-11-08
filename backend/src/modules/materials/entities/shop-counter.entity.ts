import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * İşletme başına küçük sayaçlar (ör. stok kodu sırası). Dükkâna süzülen bir varlık DEĞİLDİR: satır
 * yalnız `shop_counters` üzerinde atomik `INSERT … ON CONFLICT DO UPDATE` ile artırılır
 * (bkz. plate-sku.util.ts). Yerel sunucuya eşitlenmez; her sunucu kendi sırasını tutar.
 */
@Entity('shop_counters')
export class ShopCounter {
  @PrimaryColumn({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @PrimaryColumn({ name: 'key', type: 'varchar', length: 40 })
  key: string;

  @Column({ type: 'bigint', default: 0 })
  value: string;
}
