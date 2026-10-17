import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Dükkân (şube / ayrı işletme). Deposu, müşterileri, teklifleri, ödemeleri
 * ve ayarları diğer dükkânlardan bağımsızdır. Silinmez; kapatılır.
 */
@Entity('shops')
export class Shop extends BaseEntity {
  @Column()
  name: string;

  /** Kapalı dükkâna yalnız sistem sahibi girebilir. */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
