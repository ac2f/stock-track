import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { ShopTransfer } from './shop-transfer.entity';

/**
 * Dükkânlar arası satışın bir kalemi: satan dükkândaki malzeme (kaynak) ve
 * alan dükkânda açılan karşılığı (hedef). Tabakada her parça ayrı kalemdir;
 * böylece her parçanın alan dükkânda kime satıldığı ayrı ayrı izlenir.
 *
 * Ad/tür/ölçü belge anına ait kopyadır: kaynak tabaka sonradan kesilse ya da
 * tükense de belge değişmez.
 */
@Entity('shop_transfer_items')
@Index(['transferId'])
@Index(['sourcePlateId'])
@Index(['targetPlateId'])
export class ShopTransferItem extends BaseEntity {
  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @ManyToOne(() => ShopTransfer, (t) => t.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: ShopTransfer;

  /** Belgedeki sıra (gösterim için). */
  @Column({ name: 'line_no', type: 'int', default: 0 })
  lineNo: number;

  /** Satan dükkândaki stok kalemi. */
  @Column({ name: 'source_plate_id', type: 'uuid' })
  sourcePlateId: string;

  /** Alan dükkânda açılan stok kalemi (iptalde silinir, kimlik kalır). */
  @Column({ name: 'target_plate_id', type: 'uuid', nullable: true })
  targetPlateId?: string | null;

  @Column({ name: 'plate_name' })
  plateName: string;

  @Column({ name: 'category_name', type: 'varchar', nullable: true })
  categoryName?: string | null;

  @Column({
    name: 'measurement_type',
    type: 'enum',
    enum: MeasurementType,
    default: MeasurementType.AREA,
  })
  measurementType: MeasurementType;

  /** Tabakada parça sayısı (1); diğerlerinde adet/metre/kg. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: number;

  @Column({ name: 'width_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  widthMm?: number | null;

  @Column({ name: 'height_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  heightMm?: number | null;

  /** Birim fiyat: tabakada m² başına, diğerlerinde ölçü birimi başına. */
  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 14, scale: 2 })
  lineTotal: number;
}
