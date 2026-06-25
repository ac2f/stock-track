import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MaterialTemplate } from './material-template.entity';
import { SupplierMaterialPrice } from './supplier-material-price.entity';

/**
 * Plaka — fiili stok kalemi (SKU).
 *
 * Her plaka bir şablondan türer ve kendi en/boy/kalınlık/marka/renk/renk kodu
 * ile özel niteliklerini taşır. Stok miktarı burada tutulur.
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

  @Column({ name: 'width_mm', type: 'numeric', precision: 10, scale: 2 })
  widthMm: number; // en

  @Column({ name: 'height_mm', type: 'numeric', precision: 10, scale: 2 })
  heightMm: number; // boy

  @Column({ name: 'thickness_mm', type: 'numeric', precision: 8, scale: 2 })
  thicknessMm: number; // kalınlık

  /** Plakaya özel ek nitelikler. */
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
