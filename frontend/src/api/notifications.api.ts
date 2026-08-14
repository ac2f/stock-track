import { api } from './client';

/** Bildirim defterinin büyüklüğü (bakım ekranı). */
export async function fetchNotificationStats(): Promise<{
  total: number;
  oldestAt: string | null;
}> {
  const { data } = await api.get<{ total: number; oldestAt: string | null }>(
    '/notifications/stats',
  );
  return data;
}

/**
 * Bildirim defterini temizler. `olderThanDays` verilirse yalnızca o günden
 * eskiler silinir; verilmezse defter tamamen boşaltılır. İş verisi etkilenmez.
 */
export async function clearNotifications(
  olderThanDays?: number,
): Promise<{ deleted: number }> {
  const { data } = await api.delete<{ deleted: number }>('/notifications', {
    params: olderThanDays ? { olderThanDays } : undefined,
  });
  return data;
}

export interface NotificationRecord {
  id: string;
  type: string;
  channel: string;
  status: string;
  recipient?: string | null;
  subject?: string | null;
  body: string;
  relatedType?: string | null;
  relatedId?: string | null;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

/** Bildirim geçmişi (gönderim defteri) — en yeni önce. */
export async function fetchNotifications(
  limit = 50,
): Promise<NotificationRecord[]> {
  const { data } = await api.get<NotificationRecord[]>('/notifications', {
    params: { limit },
  });
  return data;
}
