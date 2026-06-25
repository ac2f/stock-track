import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** Satın alma sırasında kullanılan araç. */
@Entity('vehicles')
export class Vehicle extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'plate_number' })
  plateNumber: string;

  @Column()
  name: string; // "Beyaz Panelvan" vb.

  @Column({ nullable: true })
  type?: string; // Kamyonet / Panelvan / Kamyon

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
