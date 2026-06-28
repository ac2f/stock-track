import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * İş / Proje (ör. "Ahmet Tabela"). Bir işe ait tüm giderler (LED, profil, demir
 * vb.) bu kayda bağlanır; iş bazlı toplam maliyet böyle görüntülenebilir.
 */
@Entity('projects')
export class Project extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
