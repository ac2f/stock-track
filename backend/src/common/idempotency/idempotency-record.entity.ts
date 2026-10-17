import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Bir kez işlenmiş yazma isteği. İstemci her yazma isteğine benzersiz bir
 * `Idempotency-Key` koyar; bağlantı koptuğu için (ya da çevrimdışı kuyruktan)
 * aynı istek yeniden gelirse yeniden İŞLENMEZ, ilk yanıt aynen döner. Böylece
 * bir tahsilat ya da satış iki kez kaydolmaz.
 *
 * Dükkândan bağımsızdır (süzülmez); kayıtlar bir süre sonra silinir
 * (IdempotencyService.cleanup).
 */
@Entity('idempotency_keys')
export class IdempotencyRecord {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId: string | null;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 300 })
  path: string;

  /** processing: işleniyor · done: yanıt saklandı */
  @Column({ type: 'varchar', length: 12 })
  state: 'processing' | 'done';

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  /** Yanıt gövdesi; `json` (jsonb değil): alan sırası dahil aynen döner. */
  @Column({ type: 'json', nullable: true })
  body: unknown;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
