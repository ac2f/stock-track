import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Merkeze bağlanan yerel sunucu (replika). Eşitleme ajanı her istekte
 * `X-Replica-Token` başlığıyla kendini tanıtır; anahtarın yalnız özeti
 * saklanır, kendisi oluşturulurken bir kez gösterilir.
 */
@Entity('sync_replicas')
export class SyncReplica extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  /** Anahtarın SHA-256 özeti (hex). */
  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 64, select: false })
  tokenHash: string;

  /** Anahtarın ilk karakterleri (listede tanımak için). */
  @Column({ name: 'token_prefix', length: 12 })
  tokenPrefix: string;

  /** Replikanın hizmet verdiği dükkânlar; boş: hepsi. */
  @Column({ name: 'shop_ids', type: 'uuid', array: true, default: () => "'{}'" })
  shopIds: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  /** Replikanın en son çektiği değişiklik imleci. */
  @Column({ name: 'last_seq', type: 'bigint', nullable: true })
  lastSeq: string | null;

  @Column({ name: 'last_push_at', type: 'timestamptz', nullable: true })
  lastPushAt: Date | null;

  @Column({ name: 'pushed_ops', type: 'int', default: 0 })
  pushedOps: number;

  @Column({ name: 'rejected_ops', type: 'int', default: 0 })
  rejectedOps: number;
}
