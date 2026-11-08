import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/** Paylaşım kuralının kapsamı: tek bir stok kalemi ya da bir grup (ürün türü / malzeme türü). */
export const STOCK_SHARE_KINDS = ['plate', 'template', 'category'] as const;
export type StockShareKind = (typeof STOCK_SHARE_KINDS)[number];

/** Kim görebilir: bütün işletmeler ya da yalnız "stoğumu görebilir" yetkisi verdiklerim. */
export const STOCK_SHARE_VISIBILITY = ['public', 'partners'] as const;
export type StockShareVisibility = (typeof STOCK_SHARE_VISIBILITY)[number];

/**
 * "Bende var, satıyorum": işletmenin stoğunda diğer işletmelere LİSTELENEN kalemler.
 * Bir kural tek bir kalemi (`plate`) ya da bir grubu (`template` = ürün türü,
 * `category` = malzeme türü) kapsar; gruptaki stoklu kalemlerin hepsi listelenir.
 * Kural kapatılınca (`isActive=false`) liste anında kalkar, kayıt durur.
 *
 * Yalnız ADI/ÖLÇÜSÜ/MİKTARI ve (varsa) liste fiyatı görünür; maliyet, alış, müşteri
 * ve konsinye (müşterinin) stoğu hiçbir zaman listelenmez.
 */
@Entity('shop_stock_shares')
@Index(['shopId', 'kind', 'refId'], { unique: true })
export class ShopStockShare extends ShopScopedEntity {
  @Column({ type: 'varchar', length: 12 })
  kind: StockShareKind;

  /** Kalem, ürün türü ya da malzeme türünün kimliği (`kind`a göre). */
  @Column({ name: 'ref_id', type: 'uuid' })
  refId: string;

  @Column({ type: 'varchar', length: 10, default: 'public' })
  visibility: StockShareVisibility;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null;
}
