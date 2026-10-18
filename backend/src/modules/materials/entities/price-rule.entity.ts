import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { MaterialCategoryEntity } from './material-category.entity';
import { MaterialBrand } from './material-brand.entity';
import { MaterialColor } from './material-color.entity';
import { MaterialSize } from './material-size.entity';
import { MaterialThickness } from './material-thickness.entity';
import { PriceRuleEntry } from './price-rule-entry.entity';

/**
 * Fiyat çatısı: bir grup malzemenin ortak fiyat referansı.
 *
 * Kapsam kategoriyle başlar, marka/kalınlık/renk/ebat/alt tür isteğe bağlı
 * daraltır: "tüm pleksiler", "2.8 mm pleksiler", "beyaz pleksiler",
 * "Akpolimer 2.8 mm beyaz pleksi". Boş alan "hepsi" demektir.
 *
 * Her çatıda malzemecilerin (tedarikçi) fiyatları tutulur; biri çatının
 * referans fiyatı seçilir (seçilmemişse en ucuzu). Teklifte stok kaleminin
 * satış fiyatı bu referanstan önerilir. Bir kaleme birden çok çatı uyarsa en
 * özel olanı (en çok alanı tutan) geçerlidir.
 */
@Entity('price_rules')
@Index(['categoryId'])
export class PriceRule extends ShopScopedEntity {
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => MaterialCategoryEntity, { eager: true })
  @JoinColumn({ name: 'category_id' })
  category: MaterialCategoryEntity;

  @Column({ name: 'brand_id', type: 'uuid', nullable: true })
  brandId?: string | null;

  @ManyToOne(() => MaterialBrand, { eager: true, nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: MaterialBrand | null;

  @Column({ name: 'thickness_id', type: 'uuid', nullable: true })
  thicknessId?: string | null;

  @ManyToOne(() => MaterialThickness, { eager: true, nullable: true })
  @JoinColumn({ name: 'thickness_id' })
  thickness?: MaterialThickness | null;

  @Column({ name: 'color_id', type: 'uuid', nullable: true })
  colorId?: string | null;

  @ManyToOne(() => MaterialColor, { eager: true, nullable: true })
  @JoinColumn({ name: 'color_id' })
  color?: MaterialColor | null;

  /** Standart tabaka ebadı (kalan/kesilmiş ebat değil). */
  @Column({ name: 'size_id', type: 'uuid', nullable: true })
  sizeId?: string | null;

  @ManyToOne(() => MaterialSize, { eager: true, nullable: true })
  @JoinColumn({ name: 'size_id' })
  size?: MaterialSize | null;

  /** Alt tür (Dökme / Çekme), serbest metin; büyük/küçük harf fark etmez. */
  @Column({ type: 'varchar', nullable: true })
  variant?: string | null;

  /**
   * Malzemeci fiyatlarının birimi: tabaka (per_plate), m², metre, kg.
   * Bir çatıdaki bütün fiyatlar aynı birimdedir, böylece doğrudan
   * karşılaştırılır.
   */
  @Column({ type: 'enum', enum: PriceUnit, default: PriceUnit.PER_M2 })
  unit: PriceUnit;

  /** Çatıya özel kâr yüzdesi; boşsa Ayarlar › Fiyatlandırma'daki genel oran. */
  @Column({
    name: 'markup_percent',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  markupPercent?: number | null;

  /** Referans seçilen malzemeci fiyatı; boşsa en ucuzu kullanılır. */
  @Column({ name: 'reference_entry_id', type: 'uuid', nullable: true })
  referenceEntryId?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => PriceRuleEntry, (entry) => entry.rule)
  entries?: PriceRuleEntry[];
}
