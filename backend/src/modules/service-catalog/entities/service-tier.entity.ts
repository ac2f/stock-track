import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { ServiceType } from './service-type.entity';

const num = {
  to: (v?: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

/**
 * Hizmetin fiyat kademesi: "10 cm altı — 15 TL/adet", "10–30 cm — 25 TL/adet", "30 cm üstü — 120 TL/metre".
 * Ölçü aralığı [minMeasure, maxMeasure) — alt sınır dahil, üst sınır hariç; boş sınır açıktır.
 */
@Entity('service_tiers')
export class ServiceTier extends ShopScopedEntity {
  @ManyToOne(() => ServiceType, (t) => t.tiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'type_id' })
  type?: ServiceType;

  @Column({ name: 'type_id', type: 'uuid' })
  typeId: string;

  @Column({ length: 120 })
  name: string;

  @Column({ name: 'min_measure', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: num })
  minMeasure?: number | null;

  @Column({ name: 'max_measure', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: num })
  maxMeasure?: number | null;

  /** Bu kademenin birimi; boşsa hizmet türününki. */
  @Column({ type: 'enum', enum: MeasurementType, nullable: true })
  unit?: MeasurementType | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: num })
  price: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
