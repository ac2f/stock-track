import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { BusinessLabel } from './business-label.entity';

/** Bir işletmenin seçtiği etiket. Fiziksel silinir (etiket bırakılıp yeniden alınabilsin). */
@Entity('shop_labels')
@Index(['shopId', 'labelId'], { unique: true })
export class ShopLabel extends BaseEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop?: Shop;

  @Index()
  @Column({ name: 'label_id', type: 'uuid' })
  labelId: string;

  @ManyToOne(() => BusinessLabel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'label_id' })
  label?: BusinessLabel;
}
