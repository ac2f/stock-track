import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/** Kesim raporundaki bir tabaka (iyiCAM'deki bir sac). Ölçüler mm. */
export interface CutReportSheet {
  /** Stok kalemi (plaka); teklif kaleminden bulunduysa o. */
  plateId?: string | null;
  quoteItemId?: string | null;
  label?: string | null;
  thicknessMm?: number | null;
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Çizilenlerin kapladığı kutu (tabakanın sol alt köşesinden). */
  usedWidthMm?: number | null;
  usedHeightMm?: number | null;
  /** Kesimden artan dikdörtgen parça (yoksa boş). */
  offcutWidthMm?: number | null;
  offcutHeightMm?: number | null;
}

/**
 * iyiCAM'den (iyi ext pack) gelen kesim raporu: hangi tabakada ne kadar yer
 * kullanıldı, ne kadar kaldı, kesim ne kadar sürdü, hangi dosyalar kaydedildi.
 *
 * YALNIZ BİLGİDİR: teklifin fiyatı, kullanılan alanı ve stok kendiliğinden
 * değişmez. Önerilen fire ebadı işleme kaydının "Tamamla" alanlarını önceden
 * doldurur; stoğa ancak kullanıcı tamamlarken eklenir.
 */
@Entity('corel_cut_reports')
@Index(['quoteId'])
export class CorelCutReport extends ShopScopedEntity {
  @Column({ name: 'quote_id', type: 'uuid' })
  quoteId: string;

  /** Raporu gönderen bilgisayar. */
  @Column({ length: 120 })
  host: string;

  /** iyiCAM proje dosyası ve kaydedildiği iş klasörü. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  project?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  folder?: string | null;

  /** iyiCAM'in hesapladığı kesim süresi (dk) ve takım yolu sayısı. */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  minutes?: number | null;

  @Column({ type: 'int', nullable: true })
  toolpaths?: number | null;

  /** Çizilenlerin kapladığı toplam alan (m²). */
  @Column({ name: 'area_m2', type: 'numeric', precision: 12, scale: 4, nullable: true })
  areaM2?: number | null;

  @Column({ type: 'jsonb', default: [] })
  sheets: CutReportSheet[];

  /** Kaydedilen dosyaların adları (G-code, DXF ...). */
  @Column({ type: 'jsonb', default: [] })
  files: string[];

  @Column({ type: 'text', nullable: true })
  note?: string | null;
}
