import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { MaterialPlate } from './material-plate.entity';

/**
 * Depo bazlı stok seviyesi (konsinye-farkında).
 *
 * (plate, warehouse, owner) üçlüsü benzersizdir:
 *  - ownerCustomerId = NULL → işletmenin kendi stoğu.
 *  - ownerCustomerId dolu    → o müşteriye ait konsinye stok ("kimin nesi kaldı").
 */
@Entity('stock_levels')
@Unique(['plateId', 'warehouseId', 'ownerCustomerId'])
@Index(['plateId'])
export class StockLevel extends BaseEntity {
  @ManyToOne(() => MaterialPlate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plate_id' })
  plate: MaterialPlate;

  @Column({ name: 'plate_id' })
  plateId: string;

  @ManyToOne(() => Warehouse, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  // Konsinye sahibi (müşteri). NULL ise işletmenin kendi malı.
  @Column({ name: 'owner_customer_id', type: 'uuid', nullable: true })
  ownerCustomerId?: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  quantity: number;
}
