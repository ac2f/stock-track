import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * İşletmeler arası yetki türleri. Yetkiyi VEREN işletme (grantor), yetkiyi ALAN
 * işletmeye (grantee) şunu tanır:
 *
 *  - auto_approve : alanın bana yönelttiği işlemleri (bana satış teklifi, benden alım talebi)
 *                   onaylamadan kendiliğinden gerçekleştir.
 *  - view_stock   : "yalnız ortaklara" açtığım paylaşılan stoğumu görebilir.
 *  - block        : bana işlem teklif edemez, stoğumu göremez (diğer yetkilerin hepsini geçersiz kılar).
 */
export const PARTNER_PERMISSIONS = ['auto_approve', 'view_stock', 'block'] as const;
export type PartnerPermission = (typeof PARTNER_PERMISSIONS)[number];

/**
 * İki işletme arasındaki yetki. Dükkâna bağlı DEĞİLDİR (iki işletmeye birden ait);
 * erişimi servis denetler: yalnız veren işletmenin yöneticisi yazar, alan işletme
 * kendisine tanınanı salt okunur görür. Süre dolunca yetki kendiliğinden geçersiz olur
 * (`expiresAt` boş = süresiz); kayıt silinmeden de geçersizlik okuma anında hesaplanır.
 */
@Entity('shop_partner_grants')
@Index(['grantorShopId', 'granteeShopId', 'permission'], { unique: true })
@Index(['granteeShopId'])
export class ShopPartnerGrant extends BaseEntity {
  @Column({ name: 'grantor_shop_id', type: 'uuid' })
  grantorShopId: string;

  @Column({ name: 'grantee_shop_id', type: 'uuid' })
  granteeShopId: string;

  @Column({ type: 'varchar', length: 20 })
  permission: PartnerPermission;

  /** Yetkinin son anı; boş = süresiz. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null;
}

/** Yetki şu an geçerli mi? (silinmemiş ve süresi dolmamış) */
export function grantActive(g: Pick<ShopPartnerGrant, 'expiresAt' | 'deletedAt'>, now = new Date()): boolean {
  return !g.deletedAt && (!g.expiresAt || new Date(g.expiresAt).getTime() > now.getTime());
}
