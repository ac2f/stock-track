import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { PurchaseOrder } from './purchase-order.entity';

/** Satın alma kalemi — bir plakadan kaç adet, hangi birim fiyatla alındı. */
@Entity('purchase_order_items')
@Index(['purchaseOrderId'])
export class PurchaseOrderItem extends ShopScopedEntity {
  @ManyToOne(() => PurchaseOrder, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'purchase_order_id' })
  purchaseOrderId: string;

  @ManyToOne(() => MaterialPlate, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plate_id' })
  plate: MaterialPlate;

  @Column({ name: 'plate_id' })
  plateId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 14, scale: 2 })
  lineTotal: number;
}
