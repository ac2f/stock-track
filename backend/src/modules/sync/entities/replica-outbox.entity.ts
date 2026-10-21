import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Giden kutusundaki işlemin durumu (docs/SYNC.md § Giden kutusu). */
export type OutboxState =
  | 'executing' // yerelde işleniyor (çökme olursa 'uncertain' olur)
  | 'pending' // yerelde yapıldı, merkeze gönderilecek
  | 'pushing' // ajan gönderiyor
  | 'applied' // merkezde uygulandı (ya da zaten uygulanmıştı)
  | 'rejected' // merkez reddetti (stok yetmedi, yetki yok ...) — kişi karar verir
  | 'discarded' // kişi vazgeçti; yerel etkisi ajan tarafından geri alınır
  | 'uncertain'; // yerelde tamamlanıp tamamlanmadığı bilinmiyor — kişi karar verir

/**
 * YEREL SUNUCUNUN (replika) giden kutusu: yerelde başarıyla yapılmış her
 * yazma isteği (satış, tahsilat, teklif ...) asıl haliyle burada durur.
 * Eşitleme ajanı merkeze ulaşınca bunları sırayla `POST /sync/push` ile
 * gönderir; merkez her birini o kullanıcı adına aynı iş kurallarıyla yeniden
 * işler. Uygulama (yerel sunucu) yazar; ajan durumunu günceller.
 *
 * Merkezde de tablo oluşur ama kullanılmaz.
 */
@Entity('replica_outbox')
@Index(['state', 'seq'])
export class ReplicaOutbox {
  /** Gönderim sırası (yerelde yapılış sırası). */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  seq: string;

  /** İşlem kimliği; merkezde `Idempotency-Key` olarak kullanılır. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  id: string;

  @Column({ type: 'varchar', length: 12, default: 'executing' })
  state: OutboxState;

  /** user: oturum açmış kişi · corel: Corel anahtarıyla gelen (runner). */
  @Column({ type: 'varchar', length: 10, default: 'user' })
  actor: 'user' | 'corel';

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId: string | null;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  /** API ön eki olmadan yol: `/v1/sales`, `/v1/quotes/…/status?x=1`. */
  @Column({ type: 'varchar', length: 500 })
  path: string;

  /** İstek gövdesi (doğrulamadan önceki ham hali). */
  @Column({ type: 'json', nullable: true })
  body: unknown;

  /** İşlemin yerelde yapıldığı an (merkezde iş tarihi bu olur). */
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  /** Yerel yanıt kodu. */
  @Column({ name: 'local_status', type: 'int', nullable: true })
  localStatus: number | null;

  /** İstekte eklenen kayıtlar, sırasıyla: [{ table, id }] — merkez aynı kimlikleri kullanır. */
  @Column({ name: 'created_ids', type: 'jsonb', default: () => "'[]'" })
  createdIds: { table: string; id: string }[];

  /** Verilen belge numaraları: { quotes: 'TKF-2026-0042' } — merkez boşsa korur. */
  @Column({ name: 'doc_nos', type: 'jsonb', default: () => "'{}'" })
  docNos: Record<string, string>;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  /** Merkezin yanıt kodu ve gövdesi (son deneme). */
  @Column({ name: 'upstream_status', type: 'int', nullable: true })
  upstreamStatus: number | null;

  @Column({ name: 'upstream_body', type: 'json', nullable: true })
  upstreamBody: unknown;

  /** Merkezin kimlik/numara eşlemesi farklı çıktıysa: [{ table, localId, upstreamId }]. */
  @Column({ name: 'id_map', type: 'jsonb', nullable: true })
  idMap: { table: string; localId: string; upstreamId: string }[] | null;

  /** Kişiye gösterilecek açıklama (red nedeni ...). */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'resolved_by_id', type: 'uuid', nullable: true })
  resolvedById: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
