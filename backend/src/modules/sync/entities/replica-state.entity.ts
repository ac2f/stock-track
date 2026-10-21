import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * YEREL SUNUCUDA eşitleme ajanının durumu — tek satır (id = 1). Ajan yazar,
 * uygulama arayüzde gösterir (GET /system/sync). Merkezde boş kalır.
 */
@Entity('replica_state')
export class ReplicaState {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  /** Merkez sunucunun adresi (…/api/v1). */
  @Column({ name: 'upstream_url', type: 'varchar', length: 300, nullable: true })
  upstreamUrl: string | null;

  /** Merkezin kimliği (GET /sync/hello → serverId); farklı merkeze bağlanmayı önler. */
  @Column({ name: 'upstream_server_id', type: 'uuid', nullable: true })
  upstreamServerId: string | null;

  /** Merkezden en son uygulanan değişiklik imleci. */
  @Column({ name: 'last_seq', type: 'bigint', nullable: true })
  lastSeq: string | null;

  /** Yerel değişiklik günlüğünde geri alma (rebase) işlenmiş son sıra. */
  @Column({ name: 'rebased_seq', type: 'bigint', nullable: true })
  rebasedSeq: string | null;

  @Column({ name: 'snapshot_at', type: 'timestamptz', nullable: true })
  snapshotAt: Date | null;

  @Column({ name: 'last_pull_at', type: 'timestamptz', nullable: true })
  lastPullAt: Date | null;

  @Column({ name: 'last_push_at', type: 'timestamptz', nullable: true })
  lastPushAt: Date | null;

  @Column({ name: 'upstream_reachable', default: false })
  upstreamReachable: boolean;

  /** Merkezle son başarılı konuşma. */
  @Column({ name: 'last_contact_at', type: 'timestamptz', nullable: true })
  lastContactAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'agent_version', type: 'varchar', length: 40, nullable: true })
  agentVersion: string | null;

  /** Ajanın son nabzı (çalışıyor mu?). */
  @Column({ name: 'agent_heartbeat_at', type: 'timestamptz', nullable: true })
  agentHeartbeatAt: Date | null;

  /**
   * Ajan yerel değişiklikleri merkezdeki hale döndürürken (rebase) ve
   * merkezden gelenleri yazarken yeni yerel yazmaları kısa süre bekletir.
   * Süre dolunca kendiliğinden kalkar (ajan çökse de yazma kilitli kalmaz).
   */
  @Column({ name: 'writes_paused_until', type: 'timestamptz', nullable: true })
  writesPausedUntil: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
