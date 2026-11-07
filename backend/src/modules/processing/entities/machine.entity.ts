import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { MachineType } from '../../platform/entities/machine-type.entity';

/**
 * Üretim makinesi (ör. tabaka kesim, kutu harf büküm makinesi).
 * Üretim kuyruğunda işler makineye göre gruplanır → "hangi makinede ne bekliyor".
 */
@Entity('machines')
@Index(['shopId', 'code'], { unique: true })
export class Machine extends ShopScopedEntity {
  @Column()
  name: string;

  @Column()
  code: string; // ör. "KESIM", "KUTU-HARF"

  /** Bu makinenin tipik faturalama birimi (m² / metre / adet). */
  @Column({
    name: 'default_measurement_type',
    type: 'enum',
    enum: MeasurementType,
    default: MeasurementType.AREA,
  })
  defaultMeasurementType: MeasurementType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // ── Rehber alanları: işletmeler birbirinin makinelerini bulabilsin ───

  /** Platformdaki makine türü (Lazer › Fiber lazer ...). Boşsa rehberde görünmez. */
  @Index()
  @Column({ name: 'machine_type_id', type: 'uuid', nullable: true })
  machineTypeId?: string | null;

  @ManyToOne(() => MachineType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'machine_type_id' })
  machineType?: MachineType | null;

  /** Seçilen hazır ebat (`machine_type_sizes`); özel ebatta boştur. */
  @Column({ name: 'size_id', type: 'uuid', nullable: true })
  sizeId?: string | null;

  /** Çalışma alanı eni/boyu (mm): "en az şu ebatı kesebilen işletme" araması için. */
  @Column({ name: 'work_width_mm', type: 'int', nullable: true })
  workWidthMm?: number | null;

  @Column({ name: 'work_height_mm', type: 'int', nullable: true })
  workHeightMm?: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model?: string | null;

  /** Aynı makineden kaç tane var. */
  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** Diğer işletmelerin rehberinde (işletme görünürse) listelensin mi? */
  @Column({ name: 'is_public', default: true })
  isPublic: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notes?: string | null;
}
