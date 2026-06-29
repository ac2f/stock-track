import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../../common/enums/sale-source.enum';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { Sale } from './sale.entity';

/** Satış kalemi — bir malzemeden kaç birim, hangi fiyata, hangi stok kaynağıyla. */
@Entity('sale_items')
export class SaleItem extends BaseEntity {
  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => MaterialPlate, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plate_id' })
  plate: MaterialPlate;

  @Column({ name: 'plate_id' })
  plateId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: number;

  // Tabaka (AREA) satışında satılan ebat (mm) — fiş/raporda m² göstermek için.
  @Column({ name: 'width_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  widthMm?: number | null;

  @Column({ name: 'height_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  heightMm?: number | null;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 14, scale: 2 })
  lineTotal: number;

  /** Stok kaynağı: kendi stok / konsinye-takipli / takipsiz. */
  @Column({ name: 'stock_source', type: 'enum', enum: SaleStockSource })
  stockSource: SaleStockSource;

  // Üçüncü kişi malzemesinde sahip payının belirlenme yöntemi.
  @Column({
    name: 'owner_settlement',
    type: 'enum',
    enum: OwnerSettlementType,
    nullable: true,
  })
  ownerSettlement?: OwnerSettlementType | null;

  @Column({
    name: 'commission_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  commissionPercent?: number | null;

  /** Bu kalemden sahibe yansıyan tutar (işlem para biriminde). */
  @Column({ name: 'owner_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  ownerAmount: number;
}
