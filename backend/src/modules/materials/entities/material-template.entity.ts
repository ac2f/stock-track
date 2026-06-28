import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { MaterialCategoryEntity } from './material-category.entity';
import { MaterialPlate } from './material-plate.entity';
import { MaterialBrand } from './material-brand.entity';
import { MaterialColor } from './material-color.entity';
import { MaterialSize } from './material-size.entity';
import { MaterialThickness } from './material-thickness.entity';

/**
 * Malzeme Şablonu / Profil.
 *
 * Alüminyum, alüminyum kompozit, pleksi, dekota, mdf gibi malzemelerin ortak
 * özelliklerini BİR KEZ tanımlar. Yeni plaka eklerken aynı bilgileri tekrar
 * yazmak yerine şablondan miras alınır (DRY).
 *
 * Marka/renk/ebat/kalınlık varsayılanları kategoriye özel kataloglardan (FK)
 * seçilir — böylece örn. Pleksi şablonunda Kompozit'in markaları seçilemez
 * (kategori eşleşmesi servis katmanında doğrulanır).
 */
@Entity('material_templates')
export class MaterialTemplate extends BaseEntity {
  @Column()
  name: string; // "Alüminyum Kompozit 3mm"

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => MaterialCategoryEntity, { eager: true })
  @JoinColumn({ name: 'category_id' })
  category: MaterialCategoryEntity;

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

  @Column({ name: 'default_brand_id', type: 'uuid', nullable: true })
  defaultBrandId?: string | null;

  @ManyToOne(() => MaterialBrand, { eager: true, nullable: true })
  @JoinColumn({ name: 'default_brand_id' })
  defaultBrand?: MaterialBrand | null;

  @Column({ name: 'default_color_id', type: 'uuid', nullable: true })
  defaultColorId?: string | null;

  @ManyToOne(() => MaterialColor, { eager: true, nullable: true })
  @JoinColumn({ name: 'default_color_id' })
  defaultColor?: MaterialColor | null;

  @Column({ name: 'default_size_id', type: 'uuid', nullable: true })
  defaultSizeId?: string | null;

  @ManyToOne(() => MaterialSize, { eager: true, nullable: true })
  @JoinColumn({ name: 'default_size_id' })
  defaultSize?: MaterialSize | null;

  @Column({ name: 'default_thickness_id', type: 'uuid', nullable: true })
  defaultThicknessId?: string | null;

  @ManyToOne(() => MaterialThickness, { eager: true, nullable: true })
  @JoinColumn({ name: 'default_thickness_id' })
  defaultThickness?: MaterialThickness | null;

  /** Kategori içi alt tür (örn. Pleksi için "Dökme"/"Çekme") — serbest metin. */
  @Column({ name: 'default_variant', nullable: true })
  defaultVariant?: string;

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
