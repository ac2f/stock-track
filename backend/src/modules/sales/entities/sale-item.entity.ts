import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../../common/enums/sale-source.enum';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
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

  // Serbest (stoksuz) kalemde plaka yoktur → nullable.
  @ManyToOne(() => MaterialPlate, { eager: true, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plate_id' })
  plate?: MaterialPlate | null;

  @Column({ name: 'plate_id', nullable: true })
  plateId?: string | null;

  /** Serbest (stoksuz) kalemde malzeme adı; plaka seçilen kalemde null. */
  @Column({ name: 'item_name', nullable: true })
  itemName?: string | null;

  /** Serbest kalemde fiyatlama birimi (m²/metre/adet); plaka varsa null (ölçüm tipinden gelir). */
  @Column({
    name: 'billing_unit',
    type: 'enum',
    enum: MeasurementType,
    nullable: true,
  })
  billingUnit?: MeasurementType | null;

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

  /** Stok kaynağı: kendi stok / konsinye-takipli / takipsiz. Serbest kalemde null. */
  @Column({ name: 'stock_source', type: 'enum', enum: SaleStockSource, nullable: true })
  stockSource?: SaleStockSource | null;

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

  // ── Stok iadesi için tüketim izleme (satış geri alınırken kullanılır) ──
  /** Tabaka (AREA) satışında stoktan düşülen EN (mm). İadede bu kadar en eklenir. */
  @Column({ name: 'consumed_width_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  consumedWidthMm?: number | null;

  /** Tabaka (AREA) satışında stoktan düşülen BOY (mm). İadede bu kadar boy eklenir. */
  @Column({ name: 'consumed_height_mm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  consumedHeightMm?: number | null;

  /** AREA dışı satışta stoktan düşülen adet/metre. İadede bu kadar geri eklenir. */
  @Column({ name: 'consumed_quantity', type: 'numeric', precision: 12, scale: 2, default: 0 })
  consumedQuantity: number;
}
