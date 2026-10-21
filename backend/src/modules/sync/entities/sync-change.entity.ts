import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Değişiklik günlüğü (docs/SYNC.md § Değişiklik akışı). Her iş tablosundaki
 * ekleme/güncelleme/silme, veritabanı tetikleyicisiyle (sync-capture.ts) bir
 * satır olarak yazılır — ham SQL ve toplu güncellemeler de kaçmaz.
 *
 *  - merkezde: replikalar `seq` imleciyle buradan değişiklik çeker,
 *  - replikada: yerelde (çevrimdışı) değişen satırlar buradan bulunur; ajan
 *    merkezden gelen veriyi yazarken `stocktrack.sync_origin = 'upstream'`
 *    ayarlar ve o yazımlar günlüğe girmez.
 *
 * Dükkâna süzülmez; tetikleyici yazar, uygulama yalnız okur.
 */
@Entity('sync_changes')
@Index(['changedAt'])
export class SyncChange {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  seq: string;

  @Column({ name: 'table_name', type: 'varchar', length: 63 })
  tableName: string;

  @Column({ name: 'row_id', type: 'uuid' })
  rowId: string;

  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId: string | null;

  /** I: ekleme · U: güncelleme · D: silme */
  @Column({ type: 'char', length: 1 })
  op: 'I' | 'U' | 'D';

  /** Yazımı yapanın işareti (boş: uygulamanın kendisi). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  origin: string | null;

  /** Satırın yazıldığı an (clock_timestamp; transaction başı değil). */
  @Column({ name: 'changed_at', type: 'timestamptz', default: () => 'clock_timestamp()' })
  changedAt: Date;
}
