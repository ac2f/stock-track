import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** Depo / lokasyon. Stok seviyeleri depo bazında tutulur. */
@Entity('warehouses')
export class Warehouse extends BaseEntity {
  @Column()
  name: string;

  @Index({ unique: true })
  @Column()
  code: string; // ör. "MERKEZ", "SUBE-1"

  @Column({ nullable: true })
  address?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
