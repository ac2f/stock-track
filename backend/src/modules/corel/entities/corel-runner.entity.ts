import { Column, Entity, Index } from 'typeorm';
import { ShopScopedEntity } from '../../../common/shop/shop-scoped.entity';

/**
 * Dükkân bilgisayarında çalışan StockTrack Runner'ın son durumu. Runner her
 * turda (varsayılan 30 sn) nabız gönderir; arayüz "bağlı mı, en son ne zaman,
 * hangi gün klasörüne yazıyor, hata var mı" bilgisini buradan gösterir.
 * Aynı dükkânda birden çok bilgisayar olabilir: bilgisayar adı başına bir satır.
 */
@Entity('corel_runners')
@Index(['shopId', 'host'], { unique: true })
export class CorelRunner extends ShopScopedEntity {
  /** Bilgisayar adı (Windows: COMPUTERNAME). */
  @Column({ length: 120 })
  host: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  version?: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  /** Kaç saniyede bir baktığı (bağlantı koptu mu kararı için). */
  @Column({ name: 'poll_seconds', type: 'int', default: 30 })
  pollSeconds: number;

  /** Klasörleri açtığı gün klasörü kökü ve bu bilginin kaynağı. */
  @Column({ name: 'day_root', type: 'varchar', length: 500, nullable: true })
  dayRoot?: string | null;

  @Column({ name: 'day_root_source', type: 'varchar', length: 200, nullable: true })
  dayRootSource?: string | null;

  /** Son turdaki sorun; her şey yolundaysa boş. */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true })
  lastErrorAt?: Date | null;

  @Column({ name: 'last_job_quote_no', type: 'varchar', length: 40, nullable: true })
  lastJobQuoteNo?: string | null;

  @Column({ name: 'last_job_at', type: 'timestamptz', nullable: true })
  lastJobAt?: Date | null;

  @Column({ name: 'last_folder', type: 'varchar', length: 500, nullable: true })
  lastFolder?: string | null;

  /**
   * Telegram'a "bağlantısı koptu" denildiyse zamanı; nabız gelince
   * "yeniden bağlandı" denir ve temizlenir.
   */
  @Column({ name: 'offline_notified_at', type: 'timestamptz', nullable: true })
  offlineNotifiedAt?: Date | null;

  /** Son sorun bildiriminin zamanı (aynı runner için 10 dk'da en çok bir). */
  @Column({ name: 'alert_notified_at', type: 'timestamptz', nullable: true })
  alertNotifiedAt?: Date | null;
}
