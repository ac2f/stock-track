import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { BusinessLabel } from './business-label.entity';

/**
 * Makine türü (platform geneli): ağaç yapısı. Yönetici envanterde görülen
 * makinelere göre alt kategoriler ekler: "Lazer" → "CO2 lazer", "Fiber lazer";
 * "CNC" → "CNC router". İşletmeler makinelerini bu türlere bağlar; aynı türde
 * farklı ebatlar `MachineTypeSize` ile tanımlanır.
 */
@Entity('machine_types')
@Index('uq_machine_types_parent_name', ['parentId', 'name'], { unique: true, where: '"deleted_at" IS NULL' })
export class MachineType extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Üst tür (boşsa kök). */
  @Index()
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null;

  @ManyToOne(() => MachineType, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id' })
  parent?: MachineType | null;

  /** Bu tür hangi iş kolunun (etiketin) altında gösterilsin (ops.; yalnız gruplama). */
  @Index()
  @Column({ name: 'label_id', type: 'uuid', nullable: true })
  labelId?: string | null;

  @ManyToOne(() => BusinessLabel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'label_id' })
  label?: BusinessLabel | null;

  @Column({ type: 'varchar', length: 300, default: '' })
  description: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
