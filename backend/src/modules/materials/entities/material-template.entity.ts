import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MaterialCategory } from '../../../common/enums/material-category.enum';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { MaterialPlate } from './material-plate.entity';

/**
 * Malzeme Şablonu / Profil.
 *
 * Alüminyum, alüminyum kompozit, pleksi, dekota, mdf gibi malzemelerin ortak
 * özelliklerini BİR KEZ tanımlar. Yeni plaka eklerken aynı bilgileri tekrar
 * yazmak yerine şablondan miras alınır (DRY).
 */
@Entity('material_templates')
export class MaterialTemplate extends BaseEntity {
  @Column()
  name: string; // "Alüminyum Kompozit 3mm"

  @Column({ type: 'enum', enum: MaterialCategory })
  category: MaterialCategory;

  /**
   * Bu malzemenin nasıl ölçüldüğü/faturalandığı.
   * AREA (tabaka, m²), LENGTH (rulo/şerit, metre), PIECE (adet), WEIGHT (kg).
   */
  @Column({
    name: 'measurement_type',
    type: 'enum',
    enum: MeasurementType,
    default: MeasurementType.AREA,
  })
  measurementType: MeasurementType;

  @Column({ name: 'default_brand', nullable: true })
  defaultBrand?: string;

  @Column({
    name: 'default_thickness_mm',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  defaultThicknessMm?: number;

  @Column({ name: 'default_color', nullable: true })
  defaultColor?: string;

  @Column({ name: 'default_color_code', nullable: true })
  defaultColorCode?: string;

  @Column({
    name: 'default_width_mm',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  defaultWidthMm?: number;

  @Column({
    name: 'default_height_mm',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  defaultHeightMm?: number;

  /** Türü genişleten serbest nitelikler (yüzey, doku, baskı uygunluğu vb.). */
  @Column({ name: 'default_attributes', type: 'jsonb', default: {} })
  defaultAttributes: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => MaterialPlate, (plate) => plate.template)
  plates?: MaterialPlate[];
}
