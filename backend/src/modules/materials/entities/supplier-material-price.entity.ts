import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { MaterialPlate } from './material-plate.entity';

/**
 * Piyasa Fiyat Takibi.
 *
 * Aynı plakanın farklı malzemecilerde (tedarikçi) kaça satıldığını ve bu
 * fiyatın EN SON NE ZAMAN güncellendiğini tutar. Fiyat karşılaştırması bu
 * tablodan yapılır.
 *
 * (plate, supplier, unit) üçlüsü benzersizdir → her tedarikçi/birim için tek
 * bir güncel fiyat satırı bulunur.
 */
@Entity('supplier_material_prices')
@Unique(['plateId', 'supplierId', 'unit'])
@Index(['plateId'])
export class SupplierMaterialPrice extends BaseEntity {
  @ManyToOne(() => MaterialPlate, (plate) => plate.supplierPrices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'plate_id' })
  plate: MaterialPlate;

  @Column({ name: 'plate_id' })
  plateId: string;

  @ManyToOne(() => Supplier, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'supplier_id' })
  supplierId: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  price: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ type: 'enum', enum: PriceUnit, default: PriceUnit.PER_PLATE })
  unit: PriceUnit;

  /** Fiyatın en son güncellendiği tarih/saat. */
  @Column({ name: 'price_updated_at', type: 'timestamptz' })
  priceUpdatedAt: Date;

  @Column({ nullable: true })
  note?: string;
}
