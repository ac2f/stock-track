import { api } from './client';

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
