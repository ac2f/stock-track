import { api } from './client';
import type { Paginated } from '../types';

/** Bağlanılan sunucunun kimliği: merkez mi, dükkândaki yerel sunucu mu. */
export interface SystemInfo {
  role: 'primary' | 'replica';
  version: string;
  schemaHash: string;
  /** Yerel sunucu merkezden ilk yüklemeyi aldı mı (almadıysa giriş yapılamaz). */
  ready: boolean;
  serverTime: string;
}

/** Yerel sunucuda eşitleme durumu (merkezde yalnız `role`). */
export interface SyncStatus {
  role: 'primary' | 'replica';
  agentRunning?: boolean;
  upstreamReachable?: boolean;
  upstreamUrl?: string | null;
  lastContactAt?: string | null;
  lastPullAt?: string | null;
  lastPushAt?: string | null;
  snapshotAt?: string | null;
  lastError?: string | null;
  outbox?: { pending: number; rejected: number; uncertain: number; appliedToday: number };
}

export type OutboxState = 'pending' | 'pushing' | 'applied' | 'rejected' | 'discarded' | 'uncertain';

export interface OutboxItem {
  id: string;
  seq: string;
  state: OutboxState;
  actor: 'user' | 'corel';
  method: string;
  path: string;
  body: unknown;
  occurred_at: string;
  attempts: number;
  upstream_status: number | null;
  error: string | null;
  shop_id: string | null;
  shop_name: string | null;
  user_id: string | null;
  user_name: string | null;
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const { data } = await api.get<SystemInfo>('/system/info');
  return data;
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const { data } = await api.get<SyncStatus>('/system/sync');
  return data;
}

export async function fetchOutbox(params: {
  state?: OutboxState | 'open';
  page?: number;
  limit?: number;
}): Promise<Paginated<OutboxItem>> {
  const { data } = await api.get<Paginated<OutboxItem>>('/system/sync/outbox', { params });
  return data;
}

/** Reddedilen/belirsiz işlemi merkeze yeniden gönderilecek yapar. */
export async function retryOutbox(id: string): Promise<void> {
  await api.post(`/system/sync/outbox/${id}/retry`);
}

/** İşlemden vazgeçer: merkeze gönderilmez, yerel etkisi geri alınır. */
export async function discardOutbox(id: string): Promise<void> {
  await api.post(`/system/sync/outbox/${id}/discard`);
}

// ── Merkezde: yerel sunucu anahtarları (sistem sahibi) ─────────────────

export interface SyncReplica {
  id: string;
  name: string;
  tokenPrefix: string;
  shopIds: string[];
  isActive: boolean;
  lastSeenAt: string | null;
  lastSeq: string | null;
  lastPushAt: string | null;
  pushedOps: number;
  rejectedOps: number;
  /** Merkezin günlüğünden kaç değişiklik geride (yaklaşık). */
  lag: number | null;
  createdAt: string;
}

export async function fetchReplicas(): Promise<SyncReplica[]> {
  const { data } = await api.get<SyncReplica[]>('/sync/replicas');
  return data;
}

/** Yeni yerel sunucu; anahtar YALNIZ bu yanıtta gelir. */
export async function createReplica(input: {
  name: string;
  shopIds?: string[];
}): Promise<{ replica: SyncReplica; token: string }> {
  const { data } = await api.post<{ replica: SyncReplica; token: string }>('/sync/replicas', input);
  return data;
}

export async function updateReplica(
  id: string,
  input: { name?: string; isActive?: boolean },
): Promise<SyncReplica> {
  const { data } = await api.patch<SyncReplica>(`/sync/replicas/${id}`, input);
  return data;
}

export async function deleteReplica(id: string): Promise<void> {
  await api.delete(`/sync/replicas/${id}`);
}
