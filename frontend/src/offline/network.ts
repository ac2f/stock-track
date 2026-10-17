import { useSyncExternalStore } from 'react';

/**
 * Bağlantı durumu: sunucuya ulaşılıyor mu, kuyrukta kaç işlem var,
 * eşzamanlama sürüyor mu? Başlıktaki şerit bunu gösterir.
 */
export interface NetState {
  /** Sunucu (ve veritabanı) yanıt veriyor mu? */
  online: boolean;
  syncing: boolean;
  /** Bu kullanıcının sırada bekleyen işlemleri. */
  pending: number;
  /** Sunucunun reddettiği, kullanıcının bakması gereken işlemler. */
  failed: number;
  /** Son başarılı eşzamanlama (ms). */
  lastSyncAt?: number;
  /** Ekrandaki veri önbellekten mi geldi? */
  fromCache: boolean;
}

let state: NetState = { online: true, syncing: false, pending: 0, failed: 0, fromCache: false };
const listeners = new Set<() => void>();

export function getNetState(): NetState {
  return state;
}

export function patchNetState(patch: Partial<NetState>): void {
  const next = { ...state, ...patch };
  if (Object.keys(patch).every((k) => next[k as keyof NetState] === state[k as keyof NetState])) return;
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeNet(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNetState(): NetState {
  return useSyncExternalStore(subscribeNet, getNetState, getNetState);
}
