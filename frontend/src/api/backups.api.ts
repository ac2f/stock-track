import { api } from './client';

export interface BackupFileInfo {
  name: string;
  size: number;
  createdAt: string;
}

/** Diskteki (otomatik) yedeklerin listesi. */
export async function fetchBackups(): Promise<BackupFileInfo[]> {
  const { data } = await api.get<BackupFileInfo[]>('/backups');
  return data;
}

/** Anlık yedek üretir ve .sql dosyasını indirir. */
export async function downloadBackup(): Promise<void> {
  const res = await api.get('/backups/download', { responseType: 'blob' });
  const dispo = String(res.headers['content-disposition'] ?? '');
  const match = dispo.match(/filename="?([^"]+)"?/);
  const fileName =
    match?.[1] ?? `yedek-${new Date().toISOString().slice(0, 10)}.sql`;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Yüklenen .sql yedeğini geri yükler (TEHLİKELİ: veriyi üzerine yazar). */
export async function restoreBackup(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await api.post('/backups/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

// ── Şifreli yedeğin Telegram'a gönderimi ──────────────────────────────
export interface TelegramBackupResult {
  ok: boolean;
  action: 'created' | 'updated';
  messageId: number;
  dayKey: string;
  fileName: string;
  size: number;
  entryCount: number;
}

export interface TelegramBackupEntry {
  at: string;
  fileName: string;
  size: number;
  kind: 'auto' | 'manual';
}

export interface TelegramBackupState {
  chatId: string;
  dayKey: string;
  messageId: number;
  pinnedMessageId: number | null;
  entries: TelegramBackupEntry[];
  updatedAt: string;
}

/** Şifreli yedeği elle alıp Telegram'a gönderir (aynı gün mesajını ilerletir). */
export async function sendBackupToTelegram(): Promise<TelegramBackupResult> {
  const { data } = await api.post<TelegramBackupResult>('/backups/telegram');
  return data;
}

/** O güne ait Telegram yedek durumu (varsa). */
export async function fetchTelegramBackupState(): Promise<TelegramBackupState | null> {
  const { data } = await api.get<TelegramBackupState | null>(
    '/backups/telegram/state',
  );
  return data;
}

/** Şifre çözme (private) anahtarı — .enc yedekleri çözmek için. */
export async function fetchDecryptionKey(): Promise<{
  privateKeyPem: string;
  publicKeyFingerprint: string;
}> {
  const { data } = await api.get<{
    privateKeyPem: string;
    publicKeyFingerprint: string;
  }>('/backups/decryption-key');
  return data;
}
