import { Column, Entity } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/**
 * Kombinasyon indirimi: teklif listedeki hizmet türlerinin HEPSİNİ içerdiğinde bu hizmetlerin
 * toplamına kendiliğinden uygulanır — yüzde (`percent`) ya da sabit tutar (`fixed`, toplamı aşmaz).
 * Birden çok paket uyarsa en büyük indirimi veren uygulanır (indirimler üst üste binmez).
 */
@Entity('service_bundles')
export class ServiceBundle extends ShopScopedEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ name: 'service_type_ids', type: 'jsonb', default: () => "'[]'" })
  serviceTypeIds: string[];

  @Column({ name: 'discount_kind', type: 'varchar', length: 10 })
  discountKind: 'percent' | 'fixed';

  @Column({
    name: 'discount_value',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: { to: (v?: number | null) => v, from: (v: string | null) => (v == null ? 0 : Number(v)) },
  })
  discountValue: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
