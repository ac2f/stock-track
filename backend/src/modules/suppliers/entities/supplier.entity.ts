import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** Tedarikçi (malzemeci). Satın alma ve piyasa fiyatlarıyla ilişkilidir. */
@Entity('suppliers')
export class Supplier extends BaseEntity {
  @Column()
  name: string;

  @Column({ name: 'contact_name', nullable: true })
  contactName?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ name: 'tax_number', nullable: true })
  taxNumber?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
