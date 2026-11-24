import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { ServiceGroup } from './service-group.entity';
import { ServiceTier } from './service-tier.entity';

/**
 * Hizmet türü: "Harf büküm" (metre), "Harf yapıştırma" (adet) ... Fiyatı kademelerindedir (en az bir
 * kademe): ölçüye göre (ör. harf boyu, cm) uygun kademe teklifte kendiliğinden seçilir.
 * `measureLabel` boşsa ölçü sorulmaz, ilk kademe geçerlidir.
 */
@Entity('service_types')
@Index(['shopId', 'groupId', 'name'], { unique: true, where: '"deleted_at" IS NULL' })
export class ServiceType extends ShopScopedEntity {
  @ManyToOne(() => ServiceGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group?: ServiceGroup;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ length: 120 })
  name: string;

  /** Varsayılan fiyatlama birimi (kademe kendi birimini verebilir). */
  @Column({ type: 'enum', enum: MeasurementType, default: MeasurementType.PIECE })
  unit: MeasurementType;

  /** Kademeyi seçtiren ölçünün adı ("Harf boyu (cm)"); boşsa ölçü sorulmaz. */
  @Column({ name: 'measure_label', type: 'varchar', length: 60, nullable: true })
  measureLabel?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => ServiceTier, (t) => t.type)
  tiers?: ServiceTier[];
}
