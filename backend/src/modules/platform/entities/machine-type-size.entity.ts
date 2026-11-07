import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MachineType } from './machine-type.entity';

/**
 * Bir makine türünün standart çalışma alanı ebadı (mm): "Fiber lazer 1300×900",
 * "CNC router 1325×2500". İşletme makinesini bir ebada bağlar ya da kendi
 * ebadını yazar; rehberde "en az şu ebatta makinesi olan işletme" aranır.
 */
@Entity('machine_type_sizes')
@Index('uq_machine_type_sizes', ['machineTypeId', 'widthMm', 'heightMm'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class MachineTypeSize extends BaseEntity {
  @Index()
  @Column({ name: 'machine_type_id', type: 'uuid' })
  machineTypeId: string;

  @ManyToOne(() => MachineType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'machine_type_id' })
  machineType?: MachineType;

  @Column({ name: 'width_mm', type: 'int' })
  widthMm: number;

  @Column({ name: 'height_mm', type: 'int' })
  heightMm: number;

  /** Görünen ad (boşsa "1300 × 900 mm"). */
  @Column({ type: 'varchar', length: 80, default: '' })
  label: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
