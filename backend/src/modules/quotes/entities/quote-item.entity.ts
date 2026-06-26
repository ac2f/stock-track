import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../../common/enums/sale-source.enum';
import { QuoteLineKind } from '../../../common/enums/quote-status.enum';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { Quote } from './quote.entity';

/**
 * Teklif kalemi. `lineKind` türe göre alanları belirler:
 *  - SALE       → satış kalemi (stockSource/ownerSettlement/...).
 *  - PROCESSING → işleme kalemi (billingUnit/en-boy/uzunluk; unitPrice = birim işleme ücreti).
 */
@Entity('quote_items')
export class QuoteItem extends BaseEntity {
  @ManyToOne(() => Quote, (q) => q.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;

  @Column({ name: 'quote_id' })
  quoteId: string;

  @Column({ name: 'line_kind', type: 'enum', enum: QuoteLineKind })
  lineKind: QuoteLineKind;

  @ManyToOne(() => MaterialPlate, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plate_id' })
  plate: MaterialPlate;

  @Column({ name: 'plate_id' })
  plateId: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: number;

  /** Satış: birim satış fiyatı; İşleme: birim işleme ücreti (rate). */
  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 14, scale: 2 })
  lineTotal: number;

  // ── İşleme (PROCESSING) kalemi alanları ──
  @Column({
    name: 'billing_unit',
    type: 'enum',
    enum: MeasurementType,
    nullable: true,
  })
  billingUnit?: MeasurementType | null;

  @Column({
    name: 'width_mm',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  widthMm?: number | null;

  @Column({
    name: 'height_mm',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  heightMm?: number | null;

  @Column({
    name: 'length_meters',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  lengthMeters?: number | null;

  // ── Satış (SALE) kalemi alanları ──
  @Column({
    name: 'stock_source',
    type: 'enum',
    enum: SaleStockSource,
    nullable: true,
  })
  stockSource?: SaleStockSource | null;

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

  @Column({
    name: 'owner_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  ownerAmount?: number | null;
}
