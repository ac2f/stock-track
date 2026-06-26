import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import {
  MeasurementType,
  UnitOfMeasure,
} from '../../../common/enums/measurement-type.enum';
import { MaterialTemplate } from './material-template.entity';
import { SupplierMaterialPrice } from './supplier-material-price.entity';

/**
 * Stok kalemi (SKU). Tarihsel adıyla "plaka" olsa da artık genel bir malzemedir:
 * tabaka (AREA, m²), rulo/şerit (LENGTH, metre — ör. kutu harf profili), adet ya da kg.
 *
 * Her kalem bir şablondan türer; en/boy/kalınlık ölçüm tipine göre opsiyoneldir
 * (rulo malzemede yükseklik/malzeme gibi nitelikler `attributes` içinde tutulur).
 * Depo bazlı miktar `StockLevel`'da; `quantityInStock` işletme stoğunun toplam cache'idir.
 */
@Entity('material_plates')
@Index(['brand', 'color'])
export class MaterialPlate extends BaseEntity {
  @ManyToOne(() => MaterialTemplate, (template) => template.plates, {
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'template_id' })
  template: MaterialTemplate;

  @Column({ name: 'template_id' })
  templateId: string;

  @Column()
  name: string;

  @Index({ unique: true, where: '"sku" IS NOT NULL' })
  @Column({ nullable: true })
  sku?: string; // barkod / stok kodu

  @Column({ nullable: true })
  brand?: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ name: 'color_code', nullable: true })
  colorCode?: string;

  /** Ölçüm tipi (şablondan miras). m² hesabı yalnızca AREA'da uygulanır. */
  @Column({
    name: 'measurement_type',
    type: 'enum',
    enum: MeasurementType,
    default: MeasurementType.AREA,
  })
  measurementType: MeasurementType;

  /** Stok miktarının birimi (m² / metre / adet / kg). */
  @Column({
    name: 'unit_of_measure',
    type: 'enum',
    enum: UnitOfMeasure,
    default: UnitOfMeasure.PIECE,
  })
  unitOfMeasure: UnitOfMeasure;

  // Boyutlar ölçüm tipine göre opsiyoneldir (rulo malzemede en/boy gerekmez).
  @Column({
    name: 'width_mm',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  widthMm?: number | null; // en

  @Column({
    name: 'height_mm',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  heightMm?: number | null; // boy (tabaka) / profil yüksekliği değil — yükseklik attributes'ta

  @Column({
    name: 'thickness_mm',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  thicknessMm?: number | null; // kalınlık

  /**
   * Kaleme özel ek nitelikler. Rulo/şerit için tipik:
   * { malzeme: 'galvaniz'|'aluminyum', yukseklikCm: 7, ... }
   */
  @Column({ type: 'jsonb', default: {} })
  attributes: Record<string, unknown>;

  @Column({
    name: 'quantity_in_stock',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  quantityInStock: number;

  @Column({
    name: 'reorder_level',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  reorderLevel?: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => SupplierMaterialPrice, (price) => price.plate)
  supplierPrices?: SupplierMaterialPrice[];
}
