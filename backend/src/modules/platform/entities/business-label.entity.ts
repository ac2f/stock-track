import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * İşletme etiketi: platform yöneticisinin tanımladığı iş kolu ("Lazer kesim",
 * "Tabela & reklam", "Matbaa" ...). İşletme kayıt olurken bunlardan seçer;
 * diğer işletmeler rehberde etikete göre süzer. Yönetici sonradan ekler,
 * adını değiştirir, pasife alır.
 */
@Entity('business_labels')
@Index('uq_business_labels_name', ['name'], { unique: true, where: '"deleted_at" IS NULL' })
export class BusinessLabel extends BaseEntity {
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  description: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
